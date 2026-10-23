-- PostgreSQL-only constraints for Commercial Master.
-- Apply through the generated Prisma migration after `prisma migrate dev` creates the structural diff.

ALTER TABLE partner_services
  ADD CONSTRAINT partner_services_revenue_share_rate_chk
  CHECK (revenue_share_rate IS NULL OR (revenue_share_rate >= 0 AND revenue_share_rate <= 1));

ALTER TABLE partner_services
  ADD CONSTRAINT partner_services_partner_share_rate_chk
  CHECK (partner_share_rate IS NULL OR (partner_share_rate >= 0 AND partner_share_rate <= 1));

ALTER TABLE partner_services
  ADD CONSTRAINT partner_services_effective_date_chk
  CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE service_relationships
  ADD CONSTRAINT service_relationship_not_self_chk
  CHECK (parent_service_id <> child_service_id);

ALTER TABLE service_relationships
  ADD CONSTRAINT service_relationship_effective_date_chk
  CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE contracts
  ADD CONSTRAINT contracts_date_order_chk
  CHECK (expiry_date IS NULL OR effective_date IS NULL OR expiry_date >= effective_date);

ALTER TABLE contracts
  ADD CONSTRAINT contracts_non_negative_value_chk
  CHECK (base_contract_value IS NULL OR base_contract_value >= 0);

ALTER TABLE contracts
  ADD CONSTRAINT contract_not_own_parent_chk
  CHECK (parent_contract_id IS NULL OR parent_contract_id <> id);

ALTER TABLE contract_items
  ADD CONSTRAINT contract_items_quantity_chk
  CHECK (quantity >= 0);

ALTER TABLE contract_items
  ADD CONSTRAINT contract_items_discount_rate_chk
  CHECK (discount_rate IS NULL OR (discount_rate >= 0 AND discount_rate <= 1));

ALTER TABLE contract_items
  ADD CONSTRAINT contract_items_tax_rate_chk
  CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 1));

ALTER TABLE contract_services
  ADD CONSTRAINT contract_services_revenue_share_rate_chk
  CHECK (revenue_share_rate IS NULL OR (revenue_share_rate >= 0 AND revenue_share_rate <= 1));

ALTER TABLE contract_services
  ADD CONSTRAINT contract_services_partner_share_rate_chk
  CHECK (partner_share_rate IS NULL OR (partner_share_rate >= 0 AND partner_share_rate <= 1));

ALTER TABLE contract_services
  ADD CONSTRAINT contract_services_effective_date_chk
  CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE contract_terms
  ADD CONSTRAINT contract_terms_effective_date_chk
  CHECK (effective_to IS NULL OR effective_to >= effective_from);
