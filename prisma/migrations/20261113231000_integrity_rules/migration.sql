BEGIN;
INSERT INTO "Role" ("id", "label") VALUES
('SUPERADMIN', 'Superadministrator'), ('CLUB_ADMIN', 'Vereinsadministrator'),
('TEAM_MANAGER', 'Mannschaftsverantwortlicher'), ('WAREHOUSE_MANAGER', 'Lagerverantwortlicher'),
('CASH_MANAGER', 'Kassenverantwortlicher'), ('MEMBER', 'Mitglied / Helfer');

ALTER TABLE "User" ADD CONSTRAINT "User_email_normalized" CHECK (email = lower(trim(email)));
ALTER TABLE "Event" ADD CONSTRAINT "Event_time_order" CHECK ("endsAt" > "startsAt"), ADD CONSTRAINT "Event_budget_nonnegative" CHECK ("budgetCents" >= 0);
ALTER TABLE "DutyShift" ADD CONSTRAINT "DutyShift_time_order" CHECK ("endsAt" > "startsAt"), ADD CONSTRAINT "DutyShift_helpers_positive" CHECK ("requiredHelpers" > 0);
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_time_order" CHECK ("endsAt" > "startsAt");
ALTER TABLE "DutyAssignment" ADD CONSTRAINT "DutyAssignment_minutes_nonnegative" CHECK ("actualMinutes" IS NULL OR "actualMinutes" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_values_nonnegative" CHECK ("packSize" > 0 AND "minimumStock" >= 0 AND "purchasePriceCents" >= 0 AND "salePriceCents" >= 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_quantity_nonzero" CHECK (quantity <> 0);
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_quantity_positive" CHECK (quantity > 0);
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_values_valid" CHECK (quantity > 0 AND "priceCents" >= 0);
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_quantity_positive" CHECK (quantity > 0);
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_counts_nonnegative" CHECK ("expectedQuantity" >= 0 AND "countedQuantity" >= 0);
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_total_nonnegative" CHECK ("totalCents" >= 0);
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_values_valid" CHECK (quantity > 0 AND "unitPriceCents" >= 0);
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_size_positive" CHECK ("sizeBytes" > 0);
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_time_order" CHECK ("closedAt" IS NULL OR "closedAt" >= "openedAt"), ADD CONSTRAINT "CashSession_cash_nonnegative" CHECK ("openingCents" >= 0 AND ("countedCents" IS NULL OR "countedCents" >= 0));

-- The inventory ledger is append-only; corrections require a new movement.
CREATE FUNCTION protect_stock_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Lagerbewegungen dürfen nicht verändert oder gelöscht werden.';
END;
$$;
CREATE TRIGGER stock_ledger_immutable BEFORE UPDATE OR DELETE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION protect_stock_ledger();

-- Serialize movements per product/location to prevent concurrent negative stock.
CREATE FUNCTION prevent_negative_stock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_quantity bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."productId" || ':' || NEW."warehouseId", 0));
  SELECT COALESCE(SUM(quantity), 0) INTO current_quantity FROM "StockMovement" WHERE "productId" = NEW."productId" AND "warehouseId" = NEW."warehouseId";
  IF current_quantity + NEW.quantity < 0 THEN
    RAISE EXCEPTION 'Der Lagerbestand darf nicht negativ werden.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stock_nonnegative BEFORE INSERT ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION prevent_negative_stock();
COMMIT;
