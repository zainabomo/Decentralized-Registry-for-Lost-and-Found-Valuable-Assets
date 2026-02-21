import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!; // asset owner
const wallet2 = accounts.get("wallet_2")!; // finder / claimant
const wallet3 = accounts.get("wallet_3")!; // third party

const claimContract = "Claim_Processing_Contract";
const assetContract = "Asset_Registry_Contract";

// Helper: register a lost asset from wallet1 and return id
function registerLostAsset() {
  return simnet.callPublicFn(
    assetContract,
    "register-lost-asset",
    [
      Cl.stringAscii("phone"),
      Cl.stringAscii("iPhone 15 Pro Max, gold colour"),
      Cl.stringAscii("Downtown Coffee Shop"),
      Cl.uint(5000),
      Cl.buffer(new Uint8Array(32).fill(1)),
      Cl.buffer(new Uint8Array(32).fill(2)),
    ],
    wallet1
  );
}

// Helper: initiate a claim from wallet2 on asset 1
function initiateClaim(assetId: number = 1, claimant: string = wallet2) {
  return simnet.callPublicFn(
    claimContract,
    "initiate-claim",
    [
      Cl.uint(assetId),
      Cl.uint(5000),
      Cl.stringAscii("I found your phone at the coffee shop"),
    ],
    claimant
  );
}

describe("Claim Processing Contract Tests", () => {
  beforeEach(() => {
    simnet.mineEmptyBlocks(1);
  });

  // ===================================
  // Initial State
  // ===================================
  describe("Initial State", () => {
    it("should have claim ID starting at 1", () => {
      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-next-claim-id",
        [],
        deployer
      );
      expect(result).toBeUint(1);
    });

    it("should return none for non-existent claim", () => {
      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-claim",
        [Cl.uint(999)],
        deployer
      );
      expect(result).toBeNone();
    });

    it("should return zero active claims for any asset", () => {
      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-asset-active-claim-count",
        [Cl.uint(1)],
        deployer
      );
      expect(result).toBeUint(0);
    });

    it("should return default user claim stats", () => {
      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-user-claim-stats",
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result).toBeTuple({
        "total-claims-initiated": Cl.uint(0),
        "total-claims-approved": Cl.uint(0),
        "total-claims-completed": Cl.uint(0),
        "total-claims-cancelled": Cl.uint(0),
        "total-claims-escalated": Cl.uint(0),
        "total-rewards-earned": Cl.uint(0),
      });
    });

    it("should return platform stats with all zeros", () => {
      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-platform-stats",
        [],
        deployer
      );
      expect(result).toBeTuple({
        "total-claims-processed": Cl.uint(0),
        "total-successful-returns": Cl.uint(0),
        "total-rewards-distributed": Cl.uint(0),
      });
    });

    it("should return false for expired check on non-existent claim", () => {
      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "is-claim-expired",
        [Cl.uint(999)],
        deployer
      );
      expect(result).toBeBool(false);
    });

    it("should validate all claim status constants", () => {
      for (let status = 1; status <= 8; status++) {
        const { result } = simnet.callReadOnlyFn(
          claimContract,
          "is-valid-claim-status",
          [Cl.uint(status)],
          deployer
        );
        expect(result).toBeBool(true);
      }

      // Invalid status
      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "is-valid-claim-status",
        [Cl.uint(9)],
        deployer
      );
      expect(result).toBeBool(false);
    });
  });

  // ===================================
  // Claim Initiation
  // ===================================
  describe("Claim Initiation", () => {
    it("should initiate a claim successfully", () => {
      registerLostAsset();

      const { result } = initiateClaim();
      expect(result).toBeOk(Cl.uint(1));
    });

    it("should increment next claim ID after initiation", () => {
      registerLostAsset();
      initiateClaim();

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-next-claim-id",
        [],
        deployer
      );
      expect(result).toBeUint(2);
    });

    it("should store claim data correctly", () => {
      registerLostAsset();
      initiateClaim();

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-claim",
        [Cl.uint(1)],
        deployer
      );

      expect(result).not.toBeNone();
    });

    it("should increment active claim count for the asset", () => {
      registerLostAsset();
      initiateClaim();

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-asset-active-claim-count",
        [Cl.uint(1)],
        deployer
      );
      expect(result).toBeUint(1);
    });

    it("should update claimant user stats", () => {
      registerLostAsset();
      initiateClaim();

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-user-claim-stats",
        [Cl.standardPrincipal(wallet2)],
        deployer
      );
      expect(result).toBeTuple({
        "total-claims-initiated": Cl.uint(1),
        "total-claims-approved": Cl.uint(0),
        "total-claims-completed": Cl.uint(0),
        "total-claims-cancelled": Cl.uint(0),
        "total-claims-escalated": Cl.uint(0),
        "total-rewards-earned": Cl.uint(0),
      });
    });

    it("should update platform stats on initiation", () => {
      registerLostAsset();
      initiateClaim();

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-platform-stats",
        [],
        deployer
      );
      expect(result).toBeTuple({
        "total-claims-processed": Cl.uint(1),
        "total-successful-returns": Cl.uint(0),
        "total-rewards-distributed": Cl.uint(0),
      });
    });

    it("should fail when asset does not exist", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "initiate-claim",
        [
          Cl.uint(999),
          Cl.uint(1000),
          Cl.stringAscii("claim note"),
        ],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(401)); // ERR-NOT-FOUND
    });

    it("should fail when asset owner tries to claim their own asset", () => {
      registerLostAsset();

      const { result } = simnet.callPublicFn(
        claimContract,
        "initiate-claim",
        [
          Cl.uint(1),
          Cl.uint(1000),
          Cl.stringAscii("I claim my own asset"),
        ],
        wallet1 // owner is wallet1
      );
      expect(result).toBeErr(Cl.uint(400)); // ERR-UNAUTHORIZED
    });

    it("should fail with empty claimant note", () => {
      registerLostAsset();

      const { result } = simnet.callPublicFn(
        claimContract,
        "initiate-claim",
        [
          Cl.uint(1),
          Cl.uint(1000),
          Cl.stringAscii(""),
        ],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(404)); // ERR-INVALID-INPUT
    });

    it("should fail when claimant already has an active claim on the asset", () => {
      registerLostAsset();
      initiateClaim();

      const { result } = initiateClaim();
      expect(result).toBeErr(Cl.uint(403)); // ERR-ALREADY-EXISTS
    });

    it("should allow multiple claimants on the same asset (up to max)", () => {
      registerLostAsset();

      // wallet2 claims
      const { result: r1 } = initiateClaim(1, wallet2);
      expect(r1).toBeOk(Cl.uint(1));

      // wallet3 claims
      const { result: r2 } = simnet.callPublicFn(
        claimContract,
        "initiate-claim",
        [
          Cl.uint(1),
          Cl.uint(3000),
          Cl.stringAscii("I also found this phone"),
        ],
        wallet3
      );
      expect(r2).toBeOk(Cl.uint(2));

      // Active count should be 2
      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-asset-active-claim-count",
        [Cl.uint(1)],
        deployer
      );
      expect(result).toBeUint(2);
    });

    it("should report claim progress as 20% after initiation", () => {
      registerLostAsset();
      initiateClaim();

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-claim-progress",
        [Cl.uint(1)],
        deployer
      );
      expect(result).toBeUint(20);
    });
  });

  // ===================================
  // Claim Approval
  // ===================================
  describe("Claim Approval", () => {
    beforeEach(() => {
      registerLostAsset();
      initiateClaim();
    });

    it("should allow asset owner to approve a claim", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "approve-claim",
        [Cl.uint(1)],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should update claim status to APPROVED", () => {
      simnet.callPublicFn(
        claimContract,
        "approve-claim",
        [Cl.uint(1)],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-claim",
        [Cl.uint(1)],
        deployer
      );
      const claim = (result as any).value.value;
      expect(claim.status).toBeUint(2); // CLAIM-STATUS-APPROVED
    });

    it("should update claimant stats on approval", () => {
      simnet.callPublicFn(
        claimContract,
        "approve-claim",
        [Cl.uint(1)],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-user-claim-stats",
        [Cl.standardPrincipal(wallet2)],
        deployer
      );
      const stats = (result as any).value;
      expect(stats["total-claims-approved"]).toBeUint(1);
    });

    it("should fail when non-owner tries to approve", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "approve-claim",
        [Cl.uint(1)],
        wallet2 // claimant, not owner
      );
      expect(result).toBeErr(Cl.uint(400)); // ERR-UNAUTHORIZED
    });

    it("should fail when claim is not in INITIATED status", () => {
      // Approve first
      simnet.callPublicFn(
        claimContract,
        "approve-claim",
        [Cl.uint(1)],
        wallet1
      );

      // Try to approve again
      const { result } = simnet.callPublicFn(
        claimContract,
        "approve-claim",
        [Cl.uint(1)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(402)); // ERR-INVALID-STATUS
    });

    it("should fail for non-existent claim", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "approve-claim",
        [Cl.uint(999)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(401)); // ERR-NOT-FOUND
    });

    it("should report claim progress as 40% after approval", () => {
      simnet.callPublicFn(
        claimContract,
        "approve-claim",
        [Cl.uint(1)],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-claim-progress",
        [Cl.uint(1)],
        deployer
      );
      expect(result).toBeUint(40);
    });
  });

  // ===================================
  // Handoff Confirmation
  // ===================================
  describe("Handoff Confirmation", () => {
    beforeEach(() => {
      registerLostAsset();
      initiateClaim();
      simnet.callPublicFn(claimContract, "approve-claim", [Cl.uint(1)], wallet1);
    });

    it("should allow claimant to confirm handoff", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "confirm-handoff",
        [Cl.uint(1)],
        wallet2
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should update status to HANDOFF-CONFIRMED", () => {
      simnet.callPublicFn(
        claimContract,
        "confirm-handoff",
        [Cl.uint(1)],
        wallet2
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-claim",
        [Cl.uint(1)],
        deployer
      );
      const claim = (result as any).value.value;
      expect(claim.status).toBeUint(3); // CLAIM-STATUS-HANDOFF-CONFIRMED
    });

    it("should fail when non-claimant tries to confirm handoff", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "confirm-handoff",
        [Cl.uint(1)],
        wallet1 // owner, not claimant
      );
      expect(result).toBeErr(Cl.uint(400)); // ERR-UNAUTHORIZED
    });

    it("should fail when claim is not in APPROVED status", () => {
      // Confirm handoff
      simnet.callPublicFn(
        claimContract,
        "confirm-handoff",
        [Cl.uint(1)],
        wallet2
      );

      // Try to confirm again
      const { result } = simnet.callPublicFn(
        claimContract,
        "confirm-handoff",
        [Cl.uint(1)],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(402)); // ERR-INVALID-STATUS
    });

    it("should report claim progress as 60% after handoff", () => {
      simnet.callPublicFn(
        claimContract,
        "confirm-handoff",
        [Cl.uint(1)],
        wallet2
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-claim-progress",
        [Cl.uint(1)],
        deployer
      );
      expect(result).toBeUint(60);
    });
  });

  // ===================================
  // Receipt Confirmation
  // ===================================
  describe("Receipt Confirmation", () => {
    beforeEach(() => {
      registerLostAsset();
      initiateClaim();
      simnet.callPublicFn(claimContract, "approve-claim", [Cl.uint(1)], wallet1);
      simnet.callPublicFn(claimContract, "confirm-handoff", [Cl.uint(1)], wallet2);
    });

    it("should allow owner to confirm receipt", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "confirm-receipt",
        [Cl.uint(1)],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should update status to RECEIPT-CONFIRMED", () => {
      simnet.callPublicFn(
        claimContract,
        "confirm-receipt",
        [Cl.uint(1)],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-claim",
        [Cl.uint(1)],
        deployer
      );
      const claim = (result as any).value.value;
      expect(claim.status).toBeUint(4); // CLAIM-STATUS-RECEIPT-CONFIRMED
    });

    it("should fail when claimant tries to confirm receipt", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "confirm-receipt",
        [Cl.uint(1)],
        wallet2 // claimant, not owner
      );
      expect(result).toBeErr(Cl.uint(400)); // ERR-UNAUTHORIZED
    });

    it("should fail when claim is not in HANDOFF-CONFIRMED status", () => {
      simnet.callPublicFn(
        claimContract,
        "confirm-receipt",
        [Cl.uint(1)],
        wallet1
      );

      const { result } = simnet.callPublicFn(
        claimContract,
        "confirm-receipt",
        [Cl.uint(1)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(402)); // ERR-INVALID-STATUS
    });

    it("should report claim progress as 80% after receipt", () => {
      simnet.callPublicFn(
        claimContract,
        "confirm-receipt",
        [Cl.uint(1)],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-claim-progress",
        [Cl.uint(1)],
        deployer
      );
      expect(result).toBeUint(80);
    });
  });

  // ===================================
  // Claim Completion
  // ===================================
  describe("Claim Completion", () => {
    beforeEach(() => {
      registerLostAsset();
      initiateClaim();
      simnet.callPublicFn(claimContract, "approve-claim", [Cl.uint(1)], wallet1);
      simnet.callPublicFn(claimContract, "confirm-handoff", [Cl.uint(1)], wallet2);
      simnet.callPublicFn(claimContract, "confirm-receipt", [Cl.uint(1)], wallet1);
    });

    it("should allow owner to complete the claim", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "complete-claim",
        [Cl.uint(1)],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should allow claimant to complete the claim", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "complete-claim",
        [Cl.uint(1)],
        wallet2
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should update status to COMPLETED", () => {
      simnet.callPublicFn(
        claimContract,
        "complete-claim",
        [Cl.uint(1)],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-claim",
        [Cl.uint(1)],
        deployer
      );
      const claim = (result as any).value.value;
      expect(claim.status).toBeUint(5); // CLAIM-STATUS-COMPLETED
    });

    it("should decrement active claim count", () => {
      simnet.callPublicFn(
        claimContract,
        "complete-claim",
        [Cl.uint(1)],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-asset-active-claim-count",
        [Cl.uint(1)],
        deployer
      );
      expect(result).toBeUint(0);
    });

    it("should update claimant stats on completion", () => {
      simnet.callPublicFn(
        claimContract,
        "complete-claim",
        [Cl.uint(1)],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-user-claim-stats",
        [Cl.standardPrincipal(wallet2)],
        deployer
      );
      const stats = (result as any).value;
      expect(stats["total-claims-completed"]).toBeUint(1);
      expect(stats["total-rewards-earned"]).toBeUint(5000);
    });

    it("should update platform stats on completion", () => {
      simnet.callPublicFn(
        claimContract,
        "complete-claim",
        [Cl.uint(1)],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-platform-stats",
        [],
        deployer
      );
      expect(result).toBeTuple({
        "total-claims-processed": Cl.uint(1),
        "total-successful-returns": Cl.uint(1),
        "total-rewards-distributed": Cl.uint(5000),
      });
    });

    it("should fail when third party tries to complete", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "complete-claim",
        [Cl.uint(1)],
        wallet3
      );
      expect(result).toBeErr(Cl.uint(400)); // ERR-UNAUTHORIZED
    });

    it("should fail when claim is not in RECEIPT-CONFIRMED status", () => {
      simnet.callPublicFn(
        claimContract,
        "complete-claim",
        [Cl.uint(1)],
        wallet1
      );

      // Try to complete again
      const { result } = simnet.callPublicFn(
        claimContract,
        "complete-claim",
        [Cl.uint(1)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(402)); // ERR-INVALID-STATUS
    });

    it("should report claim progress as 100% after completion", () => {
      simnet.callPublicFn(
        claimContract,
        "complete-claim",
        [Cl.uint(1)],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-claim-progress",
        [Cl.uint(1)],
        deployer
      );
      expect(result).toBeUint(100);
    });
  });

  // ===================================
  // Full Lifecycle (end-to-end)
  // ===================================
  describe("Full Claim Lifecycle", () => {
    it("should complete the entire claim workflow end-to-end", () => {
      // Step 0: Register lost asset
      registerLostAsset();

      // Step 1: Initiate claim
      const { result: r1 } = initiateClaim();
      expect(r1).toBeOk(Cl.uint(1));

      // Step 2: Approve claim
      const { result: r2 } = simnet.callPublicFn(
        claimContract,
        "approve-claim",
        [Cl.uint(1)],
        wallet1
      );
      expect(r2).toBeOk(Cl.bool(true));

      // Step 3: Confirm handoff
      const { result: r3 } = simnet.callPublicFn(
        claimContract,
        "confirm-handoff",
        [Cl.uint(1)],
        wallet2
      );
      expect(r3).toBeOk(Cl.bool(true));

      // Step 4: Confirm receipt
      const { result: r4 } = simnet.callPublicFn(
        claimContract,
        "confirm-receipt",
        [Cl.uint(1)],
        wallet1
      );
      expect(r4).toBeOk(Cl.bool(true));

      // Step 5: Complete claim
      const { result: r5 } = simnet.callPublicFn(
        claimContract,
        "complete-claim",
        [Cl.uint(1)],
        wallet1
      );
      expect(r5).toBeOk(Cl.bool(true));

      // Verify final state
      const { result: finalClaim } = simnet.callReadOnlyFn(
        claimContract,
        "get-claim",
        [Cl.uint(1)],
        deployer
      );
      const claim = (finalClaim as any).value.value;
      expect(claim.status).toBeUint(5); // COMPLETED

      // Verify stats
      const { result: platStats } = simnet.callReadOnlyFn(
        claimContract,
        "get-platform-stats",
        [],
        deployer
      );
      expect(platStats).toBeTuple({
        "total-claims-processed": Cl.uint(1),
        "total-successful-returns": Cl.uint(1),
        "total-rewards-distributed": Cl.uint(5000),
      });
    });
  });

  // ===================================
  // Cancellation
  // ===================================
  describe("Claim Cancellation", () => {
    beforeEach(() => {
      registerLostAsset();
      initiateClaim();
    });

    it("should allow owner to cancel an initiated claim", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "cancel-claim",
        [Cl.uint(1), Cl.stringAscii("Changed my mind about this claim")],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should allow claimant to cancel an initiated claim", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "cancel-claim",
        [Cl.uint(1), Cl.stringAscii("I made a mistake")],
        wallet2
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should allow cancellation of approved claim", () => {
      simnet.callPublicFn(claimContract, "approve-claim", [Cl.uint(1)], wallet1);

      const { result } = simnet.callPublicFn(
        claimContract,
        "cancel-claim",
        [Cl.uint(1), Cl.stringAscii("Not the right item after all")],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should set claim status to CANCELLED", () => {
      simnet.callPublicFn(
        claimContract,
        "cancel-claim",
        [Cl.uint(1), Cl.stringAscii("Cancellation reason")],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-claim",
        [Cl.uint(1)],
        deployer
      );
      const claim = (result as any).value.value;
      expect(claim.status).toBeUint(6); // CLAIM-STATUS-CANCELLED
    });

    it("should decrement active claim count on cancellation", () => {
      simnet.callPublicFn(
        claimContract,
        "cancel-claim",
        [Cl.uint(1), Cl.stringAscii("Cancellation reason")],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-asset-active-claim-count",
        [Cl.uint(1)],
        deployer
      );
      expect(result).toBeUint(0);
    });

    it("should set cooldown on the claimant after cancellation", () => {
      simnet.callPublicFn(
        claimContract,
        "cancel-claim",
        [Cl.uint(1), Cl.stringAscii("Cancellation reason")],
        wallet2
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "is-cooldown-active",
        [Cl.standardPrincipal(wallet2), Cl.uint(1)],
        deployer
      );
      expect(result).toBeBool(true);
    });

    it("should prevent re-claim during cooldown period", () => {
      simnet.callPublicFn(
        claimContract,
        "cancel-claim",
        [Cl.uint(1), Cl.stringAscii("Cancellation reason")],
        wallet2
      );

      // Try to initiate again immediately
      const { result } = initiateClaim();
      expect(result).toBeErr(Cl.uint(406)); // ERR-COOLDOWN-ACTIVE
    });

    it("should fail when third party tries to cancel", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "cancel-claim",
        [Cl.uint(1), Cl.stringAscii("Not my claim")],
        wallet3
      );
      expect(result).toBeErr(Cl.uint(400)); // ERR-UNAUTHORIZED
    });

    it("should fail with empty reason", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "cancel-claim",
        [Cl.uint(1), Cl.stringAscii("")],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(404)); // ERR-INVALID-INPUT
    });

    it("should fail when trying to cancel a handoff-confirmed claim", () => {
      simnet.callPublicFn(claimContract, "approve-claim", [Cl.uint(1)], wallet1);
      simnet.callPublicFn(claimContract, "confirm-handoff", [Cl.uint(1)], wallet2);

      const { result } = simnet.callPublicFn(
        claimContract,
        "cancel-claim",
        [Cl.uint(1), Cl.stringAscii("Too late to cancel")],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(409)); // ERR-CLAIM-NOT-CANCELLABLE
    });

    it("should update claimant cancellation stats", () => {
      simnet.callPublicFn(
        claimContract,
        "cancel-claim",
        [Cl.uint(1), Cl.stringAscii("Reason")],
        wallet2
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-user-claim-stats",
        [Cl.standardPrincipal(wallet2)],
        deployer
      );
      const stats = (result as any).value;
      expect(stats["total-claims-cancelled"]).toBeUint(1);
    });
  });

  // ===================================
  // Escalation
  // ===================================
  describe("Claim Escalation", () => {
    beforeEach(() => {
      registerLostAsset();
      initiateClaim();
      simnet.callPublicFn(claimContract, "approve-claim", [Cl.uint(1)], wallet1);
    });

    it("should allow owner to escalate an approved claim", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "escalate-claim",
        [Cl.uint(1), Cl.stringAscii("Finder is not responding")],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should allow claimant to escalate an approved claim", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "escalate-claim",
        [Cl.uint(1), Cl.stringAscii("Owner is not cooperating")],
        wallet2
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should allow escalation of handoff-confirmed claim", () => {
      simnet.callPublicFn(claimContract, "confirm-handoff", [Cl.uint(1)], wallet2);

      const { result } = simnet.callPublicFn(
        claimContract,
        "escalate-claim",
        [Cl.uint(1), Cl.stringAscii("Owner refuses to confirm receipt")],
        wallet2
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should set claim status to ESCALATED", () => {
      simnet.callPublicFn(
        claimContract,
        "escalate-claim",
        [Cl.uint(1), Cl.stringAscii("Need admin intervention")],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-claim",
        [Cl.uint(1)],
        deployer
      );
      const claim = (result as any).value.value;
      expect(claim.status).toBeUint(7); // CLAIM-STATUS-ESCALATED
    });

    it("should fail when third party tries to escalate", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "escalate-claim",
        [Cl.uint(1), Cl.stringAscii("Not my business")],
        wallet3
      );
      expect(result).toBeErr(Cl.uint(400)); // ERR-UNAUTHORIZED
    });

    it("should fail with empty reason", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "escalate-claim",
        [Cl.uint(1), Cl.stringAscii("")],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(404)); // ERR-INVALID-INPUT
    });

    it("should fail when claim is only INITIATED (not yet approved)", () => {
      // Register another asset and initiate a new claim (no approval)
      registerLostAsset();
      simnet.callPublicFn(
        claimContract,
        "initiate-claim",
        [
          Cl.uint(2),
          Cl.uint(1000),
          Cl.stringAscii("Found something"),
        ],
        wallet2
      );

      const { result } = simnet.callPublicFn(
        claimContract,
        "escalate-claim",
        [Cl.uint(2), Cl.stringAscii("Want to escalate")],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(402)); // ERR-INVALID-STATUS
    });

    it("should update claimant escalation stats", () => {
      simnet.callPublicFn(
        claimContract,
        "escalate-claim",
        [Cl.uint(1), Cl.stringAscii("Reason")],
        wallet2
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-user-claim-stats",
        [Cl.standardPrincipal(wallet2)],
        deployer
      );
      const stats = (result as any).value;
      expect(stats["total-claims-escalated"]).toBeUint(1);
    });
  });

  // ===================================
  // Resolve Escalated Claims
  // ===================================
  describe("Resolve Escalated Claims", () => {
    beforeEach(() => {
      registerLostAsset();
      initiateClaim();
      simnet.callPublicFn(claimContract, "approve-claim", [Cl.uint(1)], wallet1);
      simnet.callPublicFn(
        claimContract,
        "escalate-claim",
        [Cl.uint(1), Cl.stringAscii("Need resolution")],
        wallet1
      );
    });

    it("should allow contract owner to resolve as completed", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "resolve-escalated-claim",
        [
          Cl.uint(1),
          Cl.bool(true), // award completion
          Cl.stringAscii("Evidence supports the finder"),
        ],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should set status to COMPLETED when resolved positively", () => {
      simnet.callPublicFn(
        claimContract,
        "resolve-escalated-claim",
        [Cl.uint(1), Cl.bool(true), Cl.stringAscii("Resolved in favour")],
        deployer
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-claim",
        [Cl.uint(1)],
        deployer
      );
      const claim = (result as any).value.value;
      expect(claim.status).toBeUint(5); // COMPLETED
    });

    it("should allow contract owner to resolve as cancelled", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "resolve-escalated-claim",
        [Cl.uint(1), Cl.bool(false), Cl.stringAscii("Claim invalid")],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should set status to CANCELLED when resolved negatively", () => {
      simnet.callPublicFn(
        claimContract,
        "resolve-escalated-claim",
        [Cl.uint(1), Cl.bool(false), Cl.stringAscii("Claim not substantiated")],
        deployer
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-claim",
        [Cl.uint(1)],
        deployer
      );
      const claim = (result as any).value.value;
      expect(claim.status).toBeUint(6); // CANCELLED
    });

    it("should decrement active claims on resolution", () => {
      simnet.callPublicFn(
        claimContract,
        "resolve-escalated-claim",
        [Cl.uint(1), Cl.bool(true), Cl.stringAscii("Resolved")],
        deployer
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-asset-active-claim-count",
        [Cl.uint(1)],
        deployer
      );
      expect(result).toBeUint(0);
    });

    it("should fail when non-owner tries to resolve", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "resolve-escalated-claim",
        [Cl.uint(1), Cl.bool(true), Cl.stringAscii("Not the owner")],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(400)); // ERR-UNAUTHORIZED
    });

    it("should fail when claim is not in ESCALATED status", () => {
      // Resolve first
      simnet.callPublicFn(
        claimContract,
        "resolve-escalated-claim",
        [Cl.uint(1), Cl.bool(true), Cl.stringAscii("Resolved")],
        deployer
      );

      // Try again
      const { result } = simnet.callPublicFn(
        claimContract,
        "resolve-escalated-claim",
        [Cl.uint(1), Cl.bool(true), Cl.stringAscii("Already resolved")],
        deployer
      );
      expect(result).toBeErr(Cl.uint(402)); // ERR-INVALID-STATUS
    });

    it("should fail with empty resolution note", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "resolve-escalated-claim",
        [Cl.uint(1), Cl.bool(true), Cl.stringAscii("")],
        deployer
      );
      expect(result).toBeErr(Cl.uint(404)); // ERR-INVALID-INPUT
    });

    it("should update platform stats on positive resolution", () => {
      simnet.callPublicFn(
        claimContract,
        "resolve-escalated-claim",
        [Cl.uint(1), Cl.bool(true), Cl.stringAscii("Completed by admin")],
        deployer
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-platform-stats",
        [],
        deployer
      );
      expect(result).toBeTuple({
        "total-claims-processed": Cl.uint(1),
        "total-successful-returns": Cl.uint(1),
        "total-rewards-distributed": Cl.uint(5000),
      });
    });
  });

  // ===================================
  // Claim Expiration
  // ===================================
  describe("Claim Expiration", () => {
    beforeEach(() => {
      registerLostAsset();
      initiateClaim();
    });

    it("should report claim as not expired initially", () => {
      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "is-claim-expired",
        [Cl.uint(1)],
        deployer
      );
      expect(result).toBeBool(false);
    });

    it("should report claim as expired after expiry blocks", () => {
      simnet.mineEmptyBlocks(1010); // > CLAIM-EXPIRY-BLOCKS (1008)

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "is-claim-expired",
        [Cl.uint(1)],
        deployer
      );
      expect(result).toBeBool(true);
    });

    it("should allow anyone to mark an expired claim", () => {
      simnet.mineEmptyBlocks(1010);

      const { result } = simnet.callPublicFn(
        claimContract,
        "mark-claim-expired",
        [Cl.uint(1)],
        wallet3 // third party
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should set claim status to EXPIRED", () => {
      simnet.mineEmptyBlocks(1010);

      simnet.callPublicFn(
        claimContract,
        "mark-claim-expired",
        [Cl.uint(1)],
        wallet3
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-claim",
        [Cl.uint(1)],
        deployer
      );
      const claim = (result as any).value.value;
      expect(claim.status).toBeUint(8); // CLAIM-STATUS-EXPIRED
    });

    it("should decrement active claims on expiration", () => {
      simnet.mineEmptyBlocks(1010);

      simnet.callPublicFn(
        claimContract,
        "mark-claim-expired",
        [Cl.uint(1)],
        wallet3
      );

      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "get-asset-active-claim-count",
        [Cl.uint(1)],
        deployer
      );
      expect(result).toBeUint(0);
    });

    it("should fail when trying to mark a non-expired claim as expired", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "mark-claim-expired",
        [Cl.uint(1)],
        wallet3
      );
      expect(result).toBeErr(Cl.uint(402)); // ERR-INVALID-STATUS
    });

    it("should fail when trying to mark an already completed claim as expired", () => {
      // Complete the full workflow first
      simnet.callPublicFn(claimContract, "approve-claim", [Cl.uint(1)], wallet1);
      simnet.callPublicFn(claimContract, "confirm-handoff", [Cl.uint(1)], wallet2);
      simnet.callPublicFn(claimContract, "confirm-receipt", [Cl.uint(1)], wallet1);
      simnet.callPublicFn(claimContract, "complete-claim", [Cl.uint(1)], wallet1);

      simnet.mineEmptyBlocks(1010);

      const { result } = simnet.callPublicFn(
        claimContract,
        "mark-claim-expired",
        [Cl.uint(1)],
        wallet3
      );
      expect(result).toBeErr(Cl.uint(402)); // ERR-INVALID-STATUS
    });

    it("should fail to approve an expired claim", () => {
      simnet.mineEmptyBlocks(1010);

      const { result } = simnet.callPublicFn(
        claimContract,
        "approve-claim",
        [Cl.uint(1)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(405)); // ERR-CLAIM-EXPIRED
    });
  });

  // ===================================
  // Cooldown System
  // ===================================
  describe("Cooldown System", () => {
    it("should enforce cooldown after cancellation", () => {
      registerLostAsset();
      initiateClaim();

      // Cancel
      simnet.callPublicFn(
        claimContract,
        "cancel-claim",
        [Cl.uint(1), Cl.stringAscii("Reason")],
        wallet2
      );

      // Verify cooldown is active
      const { result: cooldownActive } = simnet.callReadOnlyFn(
        claimContract,
        "is-cooldown-active",
        [Cl.standardPrincipal(wallet2), Cl.uint(1)],
        deployer
      );
      expect(cooldownActive).toBeBool(true);

      // Try to re-claim (should fail)
      const { result } = initiateClaim();
      expect(result).toBeErr(Cl.uint(406)); // ERR-COOLDOWN-ACTIVE
    });

    it("should allow re-claim after cooldown expires", () => {
      registerLostAsset();
      initiateClaim();

      // Cancel
      simnet.callPublicFn(
        claimContract,
        "cancel-claim",
        [Cl.uint(1), Cl.stringAscii("Reason")],
        wallet2
      );

      // Mine blocks past the cooldown period (144 blocks)
      simnet.mineEmptyBlocks(150);

      // Re-claim should succeed
      const { result } = initiateClaim();
      expect(result).toBeOk(Cl.uint(2)); // new claim ID
    });

    it("should return false for cooldown on user with no history", () => {
      const { result } = simnet.callReadOnlyFn(
        claimContract,
        "is-cooldown-active",
        [Cl.standardPrincipal(wallet3), Cl.uint(1)],
        deployer
      );
      expect(result).toBeBool(false);
    });
  });

  // ===================================
  // Ownership Transfer
  // ===================================
  describe("Ownership Transfer", () => {
    it("should allow contract owner to transfer ownership", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "transfer-ownership",
        [Cl.standardPrincipal(wallet1)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail when non-owner tries to transfer ownership", () => {
      const { result } = simnet.callPublicFn(
        claimContract,
        "transfer-ownership",
        [Cl.standardPrincipal(wallet1)],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(400)); // ERR-UNAUTHORIZED
    });
  });

  // ===================================
  // Asset Eligibility Checks
  // ===================================
  describe("Asset Eligibility", () => {
    it("should reject claims on FOUND-status assets", () => {
      // Register a found asset (not lost)
      simnet.callPublicFn(
        assetContract,
        "register-found-asset",
        [
          Cl.stringAscii("wallet"),
          Cl.stringAscii("Brown leather wallet"),
          Cl.stringAscii("Bus stop near main street"),
          Cl.buffer(new Uint8Array(32).fill(5)),
        ],
        wallet1
      );

      const { result } = simnet.callPublicFn(
        claimContract,
        "initiate-claim",
        [
          Cl.uint(1),
          Cl.uint(500),
          Cl.stringAscii("I want to claim this"),
        ],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(408)); // ERR-ASSET-NOT-ELIGIBLE
    });
  });
});
