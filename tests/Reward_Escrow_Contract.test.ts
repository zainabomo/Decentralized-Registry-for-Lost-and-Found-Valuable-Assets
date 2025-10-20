
import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

const contractName = "Reward_Escrow_Contract";

describe("Reward Escrow Contract Tests", () => {
  beforeEach(() => {
    simnet.mineEmptyBlocks(1);
  });

  describe("Initial State", () => {
    it("should have zero total escrowed initially", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-total-escrowed",
        [],
        deployer
      );
      expect(result).toBeUint(0);
    });

    it("should return none for non-existent escrow", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-escrow",
        [Cl.uint(999)],
        deployer
      );
      expect(result).toBeNone();
    });

    it("should return false for non-existent escrow expiry check", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "is-escrow-expired",
        [Cl.uint(999)],
        deployer
      );
      expect(result).toBeBool(false);
    });
  });

  describe("Escrow Creation", () => {
    it("should create escrow successfully", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-escrow",
        [Cl.uint(1), Cl.uint(1000)], // asset-id: 1, amount: 1000
        wallet1
      );
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should update total escrowed amount after creation", () => {
      simnet.callPublicFn(
        contractName,
        "create-escrow",
        [Cl.uint(1), Cl.uint(1000)],
        wallet1
      );
      
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-total-escrowed",
        [],
        deployer
      );
      expect(result).toBeUint(1000);
    });

    it("should fail with zero amount", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-escrow",
        [Cl.uint(1), Cl.uint(0)], // zero amount
        wallet1
      );
      
      expect(result).toBeErr(Cl.uint(204)); // ERR-INVALID-AMOUNT
    });

    it("should fail when escrow already exists for asset", () => {
      // Create first escrow
      simnet.callPublicFn(
        contractName,
        "create-escrow",
        [Cl.uint(1), Cl.uint(1000)],
        wallet1
      );
      
      // Try to create another escrow for same asset
      const { result } = simnet.callPublicFn(
        contractName,
        "create-escrow",
        [Cl.uint(1), Cl.uint(500)], // same asset-id
        wallet1
      );
      
      expect(result).toBeErr(Cl.uint(203)); // ERR-ALREADY-EXISTS
    });

    it("should store escrow data correctly", () => {
      simnet.callPublicFn(
        contractName,
        "create-escrow",
        [Cl.uint(1), Cl.uint(1000)],
        wallet1
      );
      
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-escrow",
        [Cl.uint(1)],
        deployer
      );
      
      expect(result).toBeSome();
    });
  });

  describe("Escrow Release", () => {
    beforeEach(() => {
      // Create an escrow for testing
      simnet.callPublicFn(
        contractName,
        "create-escrow",
        [Cl.uint(1), Cl.uint(1000)],
        wallet1
      );
    });

    it("should release escrow successfully by depositor", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "release-escrow",
        [Cl.uint(1), Cl.standardPrincipal(wallet2)], // asset-id: 1, beneficiary: wallet2
        wallet1 // depositor
      );
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail when non-depositor tries to release", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "release-escrow",
        [Cl.uint(1), Cl.standardPrincipal(wallet2)],
        wallet3 // not the depositor
      );
      
      expect(result).toBeErr(Cl.uint(200)); // ERR-UNAUTHORIZED
    });

    it("should fail for non-existent escrow", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "release-escrow",
        [Cl.uint(999), Cl.standardPrincipal(wallet2)], // non-existent asset
        wallet1
      );
      
      expect(result).toBeErr(Cl.uint(201)); // ERR-NOT-FOUND
    });
  });

  describe("Escrow Refund", () => {
    it("should refund expired escrow", () => {
      // Create escrow
      simnet.callPublicFn(
        contractName,
        "create-escrow",
        [Cl.uint(1), Cl.uint(1000)],
        wallet1
      );
      
      // Mine blocks to simulate time passing (more than ESCROW-TIMEOUT-BLOCKS)
      simnet.mineEmptyBlocks(2020); // More than 2016 blocks
      
      const { result } = simnet.callPublicFn(
        contractName,
        "refund-escrow",
        [Cl.uint(1)],
        wallet1
      );
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail when trying to refund non-expired escrow", () => {
      // Create escrow
      simnet.callPublicFn(
        contractName,
        "create-escrow",
        [Cl.uint(1), Cl.uint(1000)],
        wallet1
      );
      
      // Try to refund immediately (not expired)
      const { result } = simnet.callPublicFn(
        contractName,
        "refund-escrow",
        [Cl.uint(1)],
        wallet1
      );
      
      expect(result).toBeErr(Cl.uint(204)); // ERR-INVALID-AMOUNT (used for non-expired)
    });

    it("should fail when non-depositor tries to refund", () => {
      // Create escrow
      simnet.callPublicFn(
        contractName,
        "create-escrow",
        [Cl.uint(1), Cl.uint(1000)],
        wallet1
      );
      
      // Mine blocks to expire
      simnet.mineEmptyBlocks(2020);
      
      const { result } = simnet.callPublicFn(
        contractName,
        "refund-escrow",
        [Cl.uint(1)],
        wallet2 // not the depositor
      );
      
      expect(result).toBeErr(Cl.uint(200)); // ERR-UNAUTHORIZED
    });
  });

  describe("Dispute System", () => {
    beforeEach(() => {
      // Create and release an escrow for dispute testing
      simnet.callPublicFn(
        contractName,
        "create-escrow",
        [Cl.uint(1), Cl.uint(1000)],
        wallet1
      );
      
      simnet.callPublicFn(
        contractName,
        "release-escrow",
        [Cl.uint(1), Cl.standardPrincipal(wallet2)],
        wallet1
      );
    });

    it("should initiate dispute by depositor", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "initiate-dispute",
        [
          Cl.uint(1),
          Cl.stringAscii("Item was not returned as agreed")
        ],
        wallet1 // depositor
      );
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should initiate dispute by beneficiary", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "initiate-dispute",
        [
          Cl.uint(1),
          Cl.stringAscii("Reward was not fair")
        ],
        wallet2 // beneficiary
      );
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail when unauthorized user tries to initiate dispute", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "initiate-dispute",
        [
          Cl.uint(1),
          Cl.stringAscii("Unauthorized dispute")
        ],
        wallet3 // neither depositor nor beneficiary
      );
      
      expect(result).toBeErr(Cl.uint(200)); // ERR-UNAUTHORIZED
    });

    it("should fail with empty reason", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "initiate-dispute",
        [
          Cl.uint(1),
          Cl.stringAscii("") // empty reason
        ],
        wallet1
      );
      
      expect(result).toBeErr(Cl.uint(204)); // ERR-INVALID-AMOUNT
    });

    it("should retrieve dispute record", () => {
      // Initiate dispute first
      simnet.callPublicFn(
        contractName,
        "initiate-dispute",
        [
          Cl.uint(1),
          Cl.stringAscii("Test dispute")
        ],
        wallet1
      );
      
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-dispute",
        [Cl.uint(1)],
        deployer
      );
      
      expect(result).toBeSome();
    });
  });

  describe("Dispute Resolution", () => {
    beforeEach(() => {
      // Create, release, and dispute an escrow
      simnet.callPublicFn(
        contractName,
        "create-escrow",
        [Cl.uint(1), Cl.uint(1000)],
        wallet1
      );
      
      simnet.callPublicFn(
        contractName,
        "release-escrow",
        [Cl.uint(1), Cl.standardPrincipal(wallet2)],
        wallet1
      );
      
      simnet.callPublicFn(
        contractName,
        "initiate-dispute",
        [Cl.uint(1), Cl.stringAscii("Test dispute")],
        wallet1
      );
    });

    it("should resolve dispute in favor of depositor", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "resolve-dispute",
        [Cl.uint(1), Cl.bool(true)], // award to depositor
        deployer // owner
      );
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should resolve dispute in favor of beneficiary", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "resolve-dispute",
        [Cl.uint(1), Cl.bool(false)], // award to beneficiary
        deployer // owner
      );
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail when non-owner tries to resolve dispute", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "resolve-dispute",
        [Cl.uint(1), Cl.bool(true)],
        wallet1 // not owner
      );
      
      expect(result).toBeErr(Cl.uint(200)); // ERR-UNAUTHORIZED
    });
  });

  describe("Emergency Functions", () => {
    it("should allow owner to emergency refund", () => {
      // Create escrow
      simnet.callPublicFn(
        contractName,
        "create-escrow",
        [Cl.uint(1), Cl.uint(1000)],
        wallet1
      );
      
      const { result } = simnet.callPublicFn(
        contractName,
        "emergency-refund",
        [Cl.uint(1)],
        deployer // owner
      );
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail when non-owner tries emergency refund", () => {
      // Create escrow
      simnet.callPublicFn(
        contractName,
        "create-escrow",
        [Cl.uint(1), Cl.uint(1000)],
        wallet1
      );
      
      const { result } = simnet.callPublicFn(
        contractName,
        "emergency-refund",
        [Cl.uint(1)],
        wallet1 // not owner
      );
      
      expect(result).toBeErr(Cl.uint(200)); // ERR-UNAUTHORIZED
    });
  });

  describe("Dispute Window", () => {
    it("should check if dispute window is active", () => {
      // Create and release escrow
      simnet.callPublicFn(
        contractName,
        "create-escrow",
        [Cl.uint(1), Cl.uint(1000)],
        wallet1
      );
      
      simnet.callPublicFn(
        contractName,
        "release-escrow",
        [Cl.uint(1), Cl.standardPrincipal(wallet2)],
        wallet1
      );
      
      // Check dispute window (should be active right after release)
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "is-dispute-window-active",
        [Cl.uint(1)],
        deployer
      );
      
      expect(result).toBeBool(true);
    });

    it("should return false for non-existent escrow dispute window", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "is-dispute-window-active",
        [Cl.uint(999)], // non-existent
        deployer
      );
      
      expect(result).toBeBool(false);
    });
  });
});
