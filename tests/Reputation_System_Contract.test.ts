
import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

const contractName = "Reputation_System_Contract";

describe("Reputation System Contract Tests", () => {
  beforeEach(() => {
    simnet.mineEmptyBlocks(1);
  });

  describe("Initial State and User Initialization", () => {
    it("should return default reputation for new user", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-user-reputation",
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      
      expect(result).toBeTuple({
        score: Cl.uint(100), // INITIAL-REPUTATION
        "total-interactions": Cl.uint(0),
        "successful-returns": Cl.uint(0),
        "successful-finds": Cl.uint(0),
        "disputes-against": Cl.uint(0),
        "false-reports": Cl.uint(0),
        "average-rating": Cl.uint(0),
        "total-ratings": Cl.uint(0),
        "last-updated": Cl.uint(0)
      });
    });

    it("should initialize user reputation successfully", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "initialize-user-reputation",
        [],
        wallet1
      );
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should return false when trying to initialize already initialized user", () => {
      // Initialize first time
      simnet.callPublicFn(
        contractName,
        "initialize-user-reputation",
        [],
        wallet1
      );
      
      // Try to initialize again
      const { result } = simnet.callPublicFn(
        contractName,
        "initialize-user-reputation",
        [],
        wallet1
      );
      
      expect(result).toBeOk(Cl.bool(false));
    });
  });

  describe("Reputation Updates", () => {
    it("should record successful return by owner", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "record-successful-return",
        [Cl.standardPrincipal(wallet1), Cl.uint(1)],
        deployer
      );
      
      expect(result).toBeOk(Cl.bool(true));
      
      // Verify reputation was updated
      const { result: repData } = simnet.callReadOnlyFn(
        contractName,
        "get-user-reputation",
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      
      expect(repData).toBeTuple({
        score: Cl.uint(120), // INITIAL + SUCCESSFUL-RETURN-BONUS
        "total-interactions": Cl.uint(1),
        "successful-returns": Cl.uint(1)
      });
    });

    it("should record successful return by user themselves", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "record-successful-return",
        [Cl.standardPrincipal(wallet1), Cl.uint(1)],
        wallet1
      );
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail when unauthorized user tries to record successful return", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "record-successful-return",
        [Cl.standardPrincipal(wallet1), Cl.uint(1)],
        wallet2
      );
      
      expect(result).toBeErr(Cl.uint(300)); // ERR-UNAUTHORIZED
    });

    it("should record successful find", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "record-successful-find",
        [Cl.standardPrincipal(wallet1), Cl.uint(1)],
        deployer
      );
      
      expect(result).toBeOk(Cl.bool(true));
      
      // Verify reputation was updated
      const { result: repData } = simnet.callReadOnlyFn(
        contractName,
        "get-user-reputation",
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      
      expect(repData).toBeTuple({
        score: Cl.uint(115), // INITIAL + SUCCESSFUL-FIND-BONUS
        "total-interactions": Cl.uint(1),
        "successful-finds": Cl.uint(1)
      });
    });

    it("should record dispute (owner only)", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "record-dispute",
        [Cl.standardPrincipal(wallet1), Cl.uint(1)],
        deployer
      );
      
      expect(result).toBeOk(Cl.bool(true));
      
      // Verify reputation was penalized
      const { result: repData } = simnet.callReadOnlyFn(
        contractName,
        "get-user-reputation",
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      
      expect(repData).toBeTuple({
        score: Cl.uint(95), // INITIAL - DISPUTE-PENALTY
        "disputes-against": Cl.uint(1)
      });
    });

    it("should fail when non-owner tries to record dispute", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "record-dispute",
        [Cl.standardPrincipal(wallet1), Cl.uint(1)],
        wallet2
      );
      
      expect(result).toBeErr(Cl.uint(300)); // ERR-UNAUTHORIZED
    });

    it("should record false report (owner only)", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "record-false-report",
        [Cl.standardPrincipal(wallet1), Cl.uint(1)],
        deployer
      );
      
      expect(result).toBeOk(Cl.bool(true));
      
      // Verify reputation was penalized
      const { result: repData } = simnet.callReadOnlyFn(
        contractName,
        "get-user-reputation",
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      
      expect(repData).toBeTuple({
        score: Cl.uint(90), // INITIAL - FALSE-REPORT-PENALTY
        "false-reports": Cl.uint(1)
      });
    });
  });

  describe("User Rating System", () => {
    it("should allow user to rate another user", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "rate-user",
        [
          Cl.standardPrincipal(wallet2), // ratee
          Cl.uint(1), // asset-id
          Cl.uint(4), // rating (1-5)
          Cl.stringAscii("Great communication and quick response")
        ],
        wallet1
      );
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail when user tries to rate themselves", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "rate-user",
        [
          Cl.standardPrincipal(wallet1), // rating self
          Cl.uint(1),
          Cl.uint(4),
          Cl.stringAscii("Self rating")
        ],
        wallet1
      );
      
      expect(result).toBeErr(Cl.uint(304)); // ERR-SELF-RATING
    });

    it("should fail with invalid rating value", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "rate-user",
        [
          Cl.standardPrincipal(wallet2),
          Cl.uint(1),
          Cl.uint(6), // Invalid rating > 5
          Cl.stringAscii("Invalid rating")
        ],
        wallet1
      );
      
      expect(result).toBeErr(Cl.uint(302)); // ERR-INVALID-RATING
    });

    it("should fail when trying to rate same user twice for same asset", () => {
      // First rating
      simnet.callPublicFn(
        contractName,
        "rate-user",
        [
          Cl.standardPrincipal(wallet2),
          Cl.uint(1),
          Cl.uint(4),
          Cl.stringAscii("First rating")
        ],
        wallet1
      );
      
      // Second rating (should fail)
      const { result } = simnet.callPublicFn(
        contractName,
        "rate-user",
        [
          Cl.standardPrincipal(wallet2),
          Cl.uint(1), // Same asset ID
          Cl.uint(5),
          Cl.stringAscii("Second rating")
        ],
        wallet1
      );
      
      expect(result).toBeErr(Cl.uint(303)); // ERR-ALREADY-RATED
    });

    it("should retrieve user rating", () => {
      // Rate user first
      simnet.callPublicFn(
        contractName,
        "rate-user",
        [
          Cl.standardPrincipal(wallet2),
          Cl.uint(1),
          Cl.uint(4),
          Cl.stringAscii("Good service")
        ],
        wallet1
      );
      
      // Retrieve rating
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-user-rating",
        [
          Cl.standardPrincipal(wallet1), // rater
          Cl.standardPrincipal(wallet2), // ratee
          Cl.uint(1) // asset-id
        ],
        deployer
      );
      
      expect(result).toBeSome(Cl.tuple({
        rating: Cl.uint(4),
        comment: Cl.stringAscii("Good service"),
        timestamp: Cl.uint(simnet.burnBlockHeight)
      }));
    });
  });

  describe("Trust Score and Ranking", () => {
    it("should calculate trust score for new user", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "calculate-trust-score",
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      
      expect(result).toBeUint(50); // Default trust score for new users
    });

    it("should get user rank for new user", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-user-rank",
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      
      expect(result).toBeStringAscii("newcomer");
    });
  });

  describe("Owner Functions", () => {
    it("should allow owner to reset user reputation", () => {
      // First build some reputation
      simnet.callPublicFn(
        contractName,
        "record-successful-return",
        [Cl.standardPrincipal(wallet1), Cl.uint(1)],
        deployer
      );
      
      // Reset reputation
      const { result } = simnet.callPublicFn(
        contractName,
        "reset-user-reputation",
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      
      expect(result).toBeOk(Cl.bool(true));
      
      // Verify reputation was reset
      const { result: repData } = simnet.callReadOnlyFn(
        contractName,
        "get-user-reputation",
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      
      expect(repData).toBeTuple({
        score: Cl.uint(100), // Reset to INITIAL-REPUTATION
        "total-interactions": Cl.uint(0),
        "successful-returns": Cl.uint(0)
      });
    });

    it("should fail when non-owner tries to reset reputation", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "reset-user-reputation",
        [Cl.standardPrincipal(wallet1)],
        wallet2
      );
      
      expect(result).toBeErr(Cl.uint(300)); // ERR-UNAUTHORIZED
    });

    it("should allow owner to transfer ownership", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "transfer-ownership",
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail when non-owner tries to transfer ownership", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "transfer-ownership",
        [Cl.standardPrincipal(wallet1)],
        wallet2
      );
      
      expect(result).toBeErr(Cl.uint(300)); // ERR-UNAUTHORIZED
    });
  });

  describe("Badge System", () => {
    it("should retrieve user badge", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-user-badge",
        [
          Cl.standardPrincipal(wallet1),
          Cl.stringAscii("finder")
        ],
        deployer
      );
      
      // Should be none for new user
      expect(result).toBeNone();
    });
  });

  describe("Reputation Entry History", () => {
    it("should retrieve reputation entry", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-reputation-entry",
        [
          Cl.standardPrincipal(wallet1),
          Cl.uint(1)
        ],
        deployer
      );
      
      // Should be none if no entries exist
      expect(result).toBeNone();
    });
  });
});
