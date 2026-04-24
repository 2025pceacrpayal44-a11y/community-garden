#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, Map, String, Symbol, Vec,
};

// ─── Data Types ────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Plot {
    pub plot_id: u32,
    pub owner: Address,
    pub size_sqm: u32,
    pub active: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Tool {
    pub tool_id: u32,
    pub name: String,
    pub borrower: Option<Address>,
    pub due_back_ledger: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    PlotCount,
    ToolCount,
    Plot(u32),
    Tool(u32),
    MemberPlots(Address),
}

const BORROW_PERIOD_LEDGERS: u64 = 17_280; // ~1 day at 5s per ledger

// ─── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct CommunityGardenContract;

#[contractimpl]
impl CommunityGardenContract {

    // ── Initialise ────────────────────────────────────────────────────────────

    /// Initialise the contract. Sets the admin and seeds default tools.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialised");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PlotCount, &0u32);
        env.storage().instance().set(&DataKey::ToolCount, &0u32);

        // Seed three starter tools
        for name in ["Shovel", "Wheelbarrow", "Hoe"] {
            Self::_add_tool(&env, String::from_str(&env, name));
        }

        env.events().publish(
            (symbol_short!("init"),),
            admin,
        );
    }

    // ── Plot Management ───────────────────────────────────────────────────────

    /// Admin allocates a garden plot to a member.
    pub fn allocate_plot(env: Env, member: Address, size_sqm: u32) -> u32 {
        Self::_require_admin(&env);

        let plot_id: u32 = env.storage().instance().get(&DataKey::PlotCount).unwrap_or(0);
        let next_id = plot_id + 1;

        let plot = Plot {
            plot_id: next_id,
            owner: member.clone(),
            size_sqm,
            active: true,
        };

        env.storage().instance().set(&DataKey::Plot(next_id), &plot);
        env.storage().instance().set(&DataKey::PlotCount, &next_id);

        // Track which plots this member owns
        let mut member_plots: Vec<u32> = env
            .storage()
            .instance()
            .get(&DataKey::MemberPlots(member.clone()))
            .unwrap_or(Vec::new(&env));
        member_plots.push_back(next_id);
        env.storage()
            .instance()
            .set(&DataKey::MemberPlots(member.clone()), &member_plots);

        env.events().publish(
            (symbol_short!("alloc"), member),
            (next_id, size_sqm),
        );

        next_id
    }

    /// Member voluntarily relinquishes their plot back to the garden.
    pub fn relinquish_plot(env: Env, member: Address, plot_id: u32) {
        member.require_auth();

        let mut plot: Plot = env
            .storage()
            .instance()
            .get(&DataKey::Plot(plot_id))
            .expect("plot not found");

        if plot.owner != member {
            panic!("not your plot");
        }
        if !plot.active {
            panic!("plot already inactive");
        }

        plot.active = false;
        env.storage().instance().set(&DataKey::Plot(plot_id), &plot);

        env.events().publish(
            (symbol_short!("relq"), member),
            plot_id,
        );
    }

    /// Returns all plots owned by a member.
    pub fn get_member_plots(env: Env, member: Address) -> Vec<u32> {
        env.storage()
            .instance()
            .get(&DataKey::MemberPlots(member))
            .unwrap_or(Vec::new(&env))
    }

    /// Returns the details of a single plot.
    pub fn get_plot(env: Env, plot_id: u32) -> Plot {
        env.storage()
            .instance()
            .get(&DataKey::Plot(plot_id))
            .expect("plot not found")
    }

    // ── Tool Management ───────────────────────────────────────────────────────

    /// Admin adds a new shared tool to the inventory.
    pub fn add_tool(env: Env, name: String) -> u32 {
        Self::_require_admin(&env);
        Self::_add_tool(&env, name)
    }

    /// Borrow a tool. Tool must be available and caller must have an active plot.
    pub fn borrow_tool(env: Env, borrower: Address, tool_id: u32) {
        borrower.require_auth();
        Self::_require_active_member(&env, &borrower);

        let mut tool: Tool = env
            .storage()
            .instance()
            .get(&DataKey::Tool(tool_id))
            .expect("tool not found");

        if tool.borrower.is_some() {
            panic!("tool already borrowed");
        }

        let due_back = env.ledger().sequence() as u64 + BORROW_PERIOD_LEDGERS;
        tool.borrower = Some(borrower.clone());
        tool.due_back_ledger = due_back;
        env.storage().instance().set(&DataKey::Tool(tool_id), &tool);

        env.events().publish(
            (symbol_short!("borrow"), borrower),
            (tool_id, due_back),
        );
    }

    /// Return a borrowed tool.
    pub fn return_tool(env: Env, borrower: Address, tool_id: u32) {
        borrower.require_auth();

        let mut tool: Tool = env
            .storage()
            .instance()
            .get(&DataKey::Tool(tool_id))
            .expect("tool not found");

        match &tool.borrower {
            None => panic!("tool is not borrowed"),
            Some(current) => {
                if *current != borrower {
                    panic!("you did not borrow this tool");
                }
            }
        }

        tool.borrower = None;
        tool.due_back_ledger = 0;
        env.storage().instance().set(&DataKey::Tool(tool_id), &tool);

        env.events().publish(
            (symbol_short!("return"), borrower),
            tool_id,
        );
    }

    /// Returns the details of a single tool.
    pub fn get_tool(env: Env, tool_id: u32) -> Tool {
        env.storage()
            .instance()
            .get(&DataKey::Tool(tool_id))
            .expect("tool not found")
    }

    /// Returns the total number of tools in inventory.
    pub fn tool_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::ToolCount).unwrap_or(0)
    }

    /// Returns the total number of plots ever allocated.
    pub fn plot_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::PlotCount).unwrap_or(0)
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn _require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialised");
        admin.require_auth();
    }

    fn _require_active_member(env: &Env, member: &Address) {
        let plots: Vec<u32> = env
            .storage()
            .instance()
            .get(&DataKey::MemberPlots(member.clone()))
            .unwrap_or(Vec::new(env));

        let has_active = plots.iter().any(|pid| {
            env.storage()
                .instance()
                .get::<DataKey, Plot>(&DataKey::Plot(pid))
                .map(|p| p.active)
                .unwrap_or(false)
        });

        if !has_active {
            panic!("not an active garden member");
        }
    }

    fn _add_tool(env: &Env, name: String) -> u32 {
        let tool_count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::ToolCount)
            .unwrap_or(0);
        let next_id = tool_count + 1;

        let tool = Tool {
            tool_id: next_id,
            name,
            borrower: None,
            due_back_ledger: 0,
        };

        env.storage().instance().set(&DataKey::Tool(next_id), &tool);
        env.storage().instance().set(&DataKey::ToolCount, &next_id);
        next_id
    }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Env, Address};

    fn setup() -> (Env, CommunityGardenContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, CommunityGardenContract);
        let client = CommunityGardenContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, client, admin)
    }

    #[test]
    fn test_allocate_and_get_plot() {
        let (env, client, _admin) = setup();
        let member = Address::generate(&env);
        let plot_id = client.allocate_plot(&member, &25);
        assert_eq!(plot_id, 4); // 3 tools seeded, plots start from 1
        let plot = client.get_plot(&plot_id);
        assert_eq!(plot.owner, member);
        assert_eq!(plot.size_sqm, 25);
        assert!(plot.active);
    }

    #[test]
    fn test_borrow_and_return_tool() {
        let (env, client, _admin) = setup();
        let member = Address::generate(&env);
        client.allocate_plot(&member, &20);

        // Borrow tool #1 (Shovel)
        client.borrow_tool(&member, &1);
        let tool = client.get_tool(&1);
        assert_eq!(tool.borrower, Some(member.clone()));

        // Return it
        client.return_tool(&member, &1);
        let tool = client.get_tool(&1);
        assert_eq!(tool.borrower, None);
    }

    #[test]
    fn test_relinquish_plot() {
        let (env, client, _admin) = setup();
        let member = Address::generate(&env);
        let plot_id = client.allocate_plot(&member, &15);
        client.relinquish_plot(&member, &plot_id);
        let plot = client.get_plot(&plot_id);
        assert!(!plot.active);
    }

    #[test]
    #[should_panic(expected = "tool already borrowed")]
    fn test_double_borrow_fails() {
        let (env, client, _admin) = setup();
        let m1 = Address::generate(&env);
        let m2 = Address::generate(&env);
        client.allocate_plot(&m1, &10);
        client.allocate_plot(&m2, &10);
        client.borrow_tool(&m1, &1);
        client.borrow_tool(&m2, &1); // should panic
    }

    #[test]
    #[should_panic(expected = "not an active garden member")]
    fn test_non_member_cannot_borrow() {
        let (env, client, _admin) = setup();
        let stranger = Address::generate(&env);
        client.borrow_tool(&stranger, &1); // should panic
    }
}

