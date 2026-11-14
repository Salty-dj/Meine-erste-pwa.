-- Protect only this application's tables from Supabase's anonymous Data API.
-- Server-side PostgreSQL owners/BYPASSRLS roles retain their existing app access.
-- Other tables, other schemas and existing migration files are untouched.
BEGIN;
ALTER FUNCTION protect_stock_ledger() SET search_path FROM CURRENT;
ALTER FUNCTION prevent_negative_stock() SET search_path FROM CURRENT;
DO $privacy$
DECLARE
  table_name text;
  api_role text;
  app_schema text := current_schema();
BEGIN
  FOREACH table_name IN ARRAY ARRAY['User','Role','UserRole','Session','LoginThrottle','Member','Team','TeamMember','Event','DutyType','DutyShift','DutyAssignment','DutySwapRequest','Availability','ChecklistTemplate','ChecklistItem','ChecklistExecution','ChecklistResult','Task','DamageReport','ProductCategory','Product','Warehouse','StockMovement','StockReservation','Inventory','InventoryItem','Supplier','PurchaseOrder','PurchaseOrderItem','GoodsReceipt','CashSession','Sale','SaleItem','FinanceTransaction','Notification','Attachment','AuditLog','AppSetting','_prisma_migrations']
  LOOP
    IF to_regclass(format('%I.%I', app_schema, table_name)) IS NOT NULL THEN
      FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
          EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I', app_schema, table_name, api_role);
        END IF;
      END LOOP;
      -- No public Data API policies are created. Prisma uses its server DB role.
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', app_schema, table_name);
    END IF;
  END LOOP;
END;
$privacy$;
COMMIT;
