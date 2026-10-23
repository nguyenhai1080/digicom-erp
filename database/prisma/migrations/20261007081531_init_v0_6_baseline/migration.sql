-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'SECRET');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('CUSTOMER', 'SUPPLIER', 'BOTH', 'CONTENT_PROVIDER', 'AGGREGATOR', 'TECHNOLOGY_PARTNER', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLACKLISTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContactRole" AS ENUM ('COMMERCIAL', 'TECHNICAL', 'FINANCE', 'LEGAL', 'MANAGEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('VAS', 'DIGITAL_CONTENT', 'PLATFORM', 'SOFTWARE', 'CONSULTING', 'MANAGED_SERVICE', 'LICENSE', 'HOSTING', 'INTEGRATION', 'PROJECT_SERVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "BusinessModel" AS ENUM ('REVENUE_SHARE', 'FIXED_FEE', 'SUBSCRIPTION', 'LICENSE', 'COMMISSION', 'PROJECT', 'USAGE_BASED', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractBusinessType" AS ENUM ('REVENUE_SHARE', 'PROJECT', 'PURCHASE', 'FRAMEWORK', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('MAIN', 'ADDENDUM', 'AMENDMENT', 'EXTENSION', 'FRAMEWORK', 'PURCHASE_ORDER', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'READY_TO_SIGN', 'SIGNED', 'ACTIVE', 'COMPLETED', 'LIQUIDATING', 'LIQUIDATED', 'EXPIRED', 'TERMINATED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ContractValueType" AS ENUM ('FIXED', 'ESTIMATED', 'CEILING', 'UNIT_RATE', 'REVENUE_SHARE', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ContractPartyRole" AS ENUM ('SELLER', 'BUYER', 'GUARANTOR', 'SUBCONTRACTOR', 'BENEFICIARY', 'OTHER');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'USAGE_BASED', 'MILESTONE', 'OTHER');

-- CreateEnum
CREATE TYPE "PricingBasis" AS ENUM ('FIXED', 'PER_USER', 'PER_TRANSACTION', 'PER_MONTH', 'PER_LICENSE', 'PER_SITE', 'PER_UNIT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ServiceRelationshipType" AS ENUM ('INCLUDED', 'AGGREGATED', 'BUNDLED', 'DEPENDENT');

-- CreateEnum
CREATE TYPE "GuaranteePeriod" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL', 'CONTRACT_TERM');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('LEAD', 'QUALIFICATION', 'QUOTATION_PREPARING', 'QUOTATION_SENT', 'NEGOTIATION', 'WON', 'CONTRACT_PREPARING', 'CONTRACTED', 'IN_PROGRESS', 'UAT', 'ACCEPTED', 'PENDING_CLOSURE', 'CLOSED', 'ARCHIVED', 'LOST', 'NO_BID', 'ON_HOLD', 'CANCELLED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "OpportunitySource" AS ENUM ('DIRECT_CUSTOMER', 'PARTNER_REFERRAL', 'TENDER', 'RFP', 'RFQ', 'INTERNAL_LEAD', 'EXISTING_CUSTOMER', 'OTHER');

-- CreateEnum
CREATE TYPE "QualificationResult" AS ENUM ('QUALIFIED', 'NEEDS_REVIEW', 'NO_BID');

-- CreateEnum
CREATE TYPE "ProjectHealth" AS ENUM ('GREEN', 'YELLOW', 'RED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'APPROVED', 'SENT', 'NEGOTIATION', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED', 'COMMENTED');

-- CreateEnum
CREATE TYPE "ProjectContractRole" AS ENUM ('MAIN', 'ADDENDUM', 'PURCHASE', 'SUBCONTRACT', 'SUPPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivationConditionType" AS ENUM ('EFFECTIVE_DATE', 'ADVANCE_PAYMENT', 'PURCHASE_ORDER', 'BANK_GUARANTEE', 'LICENSE_APPROVAL', 'TECHNICAL_PREREQUISITE', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivationConditionStatus" AS ENUM ('PENDING', 'SATISFIED', 'WAIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('ADVANCE', 'MILESTONE', 'PERIODIC', 'USAGE', 'FINAL', 'RETENTION', 'MANUAL');

-- CreateEnum
CREATE TYPE "BillingTriggerType" AS ENUM ('CONTRACT_SIGNED', 'CONTRACT_ACTIVE', 'DATE', 'MILESTONE_COMPLETED', 'MILESTONE_ACCEPTED', 'UAT_ACCEPTED', 'GO_LIVE', 'FINAL_ACCEPTANCE', 'DELIVERABLE_ACCEPTED', 'WARRANTY_COMPLETED', 'MANUAL');

-- CreateEnum
CREATE TYPE "BillingTriggerStatus" AS ENUM ('PENDING', 'MET', 'VERIFIED', 'WAIVED');

-- CreateEnum
CREATE TYPE "BillingScheduleStatus" AS ENUM ('NOT_DUE', 'PENDING_TRIGGER', 'ELIGIBLE', 'READY_TO_INVOICE', 'PARTIALLY_INVOICED', 'INVOICED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "PaymentDueRule" AS ENUM ('AFTER_INVOICE', 'AFTER_ACCEPTANCE', 'FIXED_DATE', 'AFTER_CONTRACT_SIGN', 'AFTER_GO_LIVE', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentScheduleStatus" AS ENUM ('NOT_DUE', 'DUE', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FxRule" AS ENUM ('FIXED_RATE', 'INVOICE_DATE_RATE', 'PAYMENT_DATE_RATE', 'CENTRAL_BANK_RATE', 'CONTRACT_RATE', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "BillingRecurrence" AS ENUM ('NONE', 'MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('DRAFT', 'UPLOADED', 'OCR_EXTRACTED', 'UNDER_REVIEW', 'VALIDATED', 'PENDING_APPROVAL', 'APPROVED', 'SUPERSEDED', 'REJECTED', 'CANCELLED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ReconciliationSourceType" AS ENUM ('FILE_UPLOAD', 'MANUAL_ENTRY', 'API_IMPORT', 'SYSTEM_IMPORT');

-- CreateEnum
CREATE TYPE "RevenueStatus" AS ENUM ('GENERATED', 'VALIDATED', 'INVOICE_READY', 'INVOICED', 'PARTIALLY_PAID', 'PAID', 'SUPERSEDED', 'CANCELLED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "InvoiceMode" AS ENUM ('PER_SERVICE', 'CONSOLIDATED');

-- CreateEnum
CREATE TYPE "InvoiceScopeStatus" AS ENUM ('BUILDING', 'VALID', 'INVOICE_READY', 'INVOICED', 'SUPERSEDED', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('MONTHLY', 'QUARTERLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ValidationSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'BLOCK');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "company_code" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "short_name" TEXT,
    "tax_code" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "default_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "reporting_currency" VARCHAR(3),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "configurations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "config_key" TEXT NOT NULL,
    "config_value" TEXT,
    "value_type" "ValueType" NOT NULL DEFAULT 'STRING',
    "description" TEXT,
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequences" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "sequence_name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "current_value" BIGINT NOT NULL DEFAULT 0,
    "padding" INTEGER NOT NULL DEFAULT 4,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "original_filename" TEXT NOT NULL,
    "stored_filename" TEXT NOT NULL,
    "storage_provider" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT,
    "file_size" BIGINT,
    "checksum_sha256" TEXT,
    "uploaded_by_id" UUID,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "document_code" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "document_number" TEXT,
    "version_no" INTEGER NOT NULL DEFAULT 1,
    "document_date" DATE,
    "attachment_id" UUID NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "old_value" JSONB,
    "new_value" JSONB,
    "reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "trace_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "partner_code" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "short_name" TEXT,
    "partner_type" "PartnerType" NOT NULL,
    "status" "PartnerStatus" NOT NULL DEFAULT 'PROSPECT',
    "country_code" VARCHAR(2),
    "tax_code" TEXT,
    "registration_number" TEXT,
    "legal_representative" TEXT,
    "registered_address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "default_currency" VARCHAR(3),
    "payment_term_days" INTEGER,
    "owner_user_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_contacts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "job_title" TEXT,
    "department" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "role" "ContactRole" NOT NULL DEFAULT 'OTHER',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_bank_accounts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "bank_name" TEXT NOT NULL,
    "branch_name" TEXT,
    "account_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "swift_code" TEXT,
    "iban" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "service_code" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL,
    "description" TEXT,
    "default_business_model" "BusinessModel",
    "default_currency" VARCHAR(3),
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_services" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "external_service_code" TEXT,
    "business_model" "BusinessModel" NOT NULL,
    "currency" VARCHAR(3),
    "revenue_share_rate" DECIMAL(9,6),
    "partner_share_rate" DECIMAL(9,6),
    "market_code" TEXT,
    "channel_code" TEXT,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_relationships" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "parent_service_id" UUID NOT NULL,
    "child_service_id" UUID NOT NULL,
    "relationship_type" "ServiceRelationshipType" NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contract_code" TEXT NOT NULL,
    "contract_number" TEXT,
    "contract_name" TEXT NOT NULL,
    "partner_id" UUID NOT NULL,
    "business_type" "ContractBusinessType" NOT NULL,
    "contract_type" "ContractType" NOT NULL,
    "value_type" "ContractValueType" NOT NULL,
    "parent_contract_id" UUID,
    "signing_date" DATE,
    "effective_date" DATE,
    "expiry_date" DATE,
    "currency" VARCHAR(3),
    "base_contract_value" DECIMAL(20,4),
    "tax_amount" DECIMAL(20,4),
    "gross_contract_value" DECIMAL(20,4),
    "wht_amount" DECIMAL(20,4),
    "net_expected_collection" DECIMAL(20,4),
    "payment_term_days" INTEGER,
    "owner_user_id" UUID,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "source_project_id" UUID,
    "source_quotation_id" UUID,
    "official_document_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_parties" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "partner_id" UUID,
    "party_role" "ContractPartyRole" NOT NULL,
    "legal_name" TEXT NOT NULL,
    "tax_code" TEXT,
    "address" TEXT,
    "signatory" TEXT,
    "position" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "service_id" UUID,
    "item_no" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL DEFAULT 1,
    "unit" TEXT,
    "unit_price" DECIMAL(20,4) NOT NULL,
    "discount_rate" DECIMAL(9,6),
    "discount_amount" DECIMAL(20,4),
    "tax_rate" DECIMAL(9,6),
    "tax_amount" DECIMAL(20,4),
    "subtotal" DECIMAL(20,4) NOT NULL,
    "line_total" DECIMAL(20,4) NOT NULL,
    "charge_type" "ChargeType" NOT NULL,
    "pricing_basis" "PricingBasis" NOT NULL,
    "source_quotation_item_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_services" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "business_model" "BusinessModel" NOT NULL,
    "currency" VARCHAR(3),
    "revenue_share_rate" DECIMAL(9,6),
    "partner_share_rate" DECIMAL(9,6),
    "fixed_fee" DECIMAL(20,4),
    "unit_price" DECIMAL(20,4),
    "minimum_guarantee_amount" DECIMAL(20,4),
    "minimum_guarantee_period" "GuaranteePeriod",
    "market_code" TEXT,
    "channel_code" TEXT,
    "scope_reference" TEXT,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_terms" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "term_type" TEXT NOT NULL,
    "term_key" TEXT NOT NULL,
    "term_value" TEXT NOT NULL,
    "value_type" "ValueType" NOT NULL DEFAULT 'STRING',
    "effective_from" DATE,
    "effective_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_code" TEXT NOT NULL,
    "project_name" TEXT NOT NULL,
    "partner_id" UUID NOT NULL,
    "owner_user_id" UUID,
    "description" TEXT,
    "scope" TEXT,
    "source" "OpportunitySource" NOT NULL DEFAULT 'OTHER',
    "estimated_value" DECIMAL(20,4),
    "currency" VARCHAR(3),
    "probability" DECIMAL(9,6),
    "expected_close_date" DATE,
    "expected_start_date" DATE,
    "expected_end_date" DATE,
    "actual_start_date" DATE,
    "actual_end_date" DATE,
    "progress_percent" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "health_status" "ProjectHealth" NOT NULL DEFAULT 'UNKNOWN',
    "status" "ProjectStatus" NOT NULL DEFAULT 'LEAD',
    "accepted_quotation_id" UUID,
    "lost_reason" TEXT,
    "lost_to_competitor" TEXT,
    "no_bid_reason" TEXT,
    "forecast_completion_date" DATE,
    "forecast_remaining_cost" DECIMAL(20,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_qualifications" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "customer_need_score" INTEGER,
    "budget_score" INTEGER,
    "technical_score" INTEGER,
    "commercial_score" INTEGER,
    "timeline_score" INTEGER,
    "decision_maker_score" INTEGER,
    "strategic_fit_score" INTEGER,
    "total_score" INTEGER,
    "result" "QualificationResult" NOT NULL,
    "comments" TEXT,
    "no_bid_reason" TEXT,
    "qualified_by_id" UUID,
    "qualified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_qualifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_activities" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "activity_type" TEXT NOT NULL,
    "activity_date" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "next_action" TEXT,
    "next_action_date" TIMESTAMP(3),
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "quotation_code" TEXT NOT NULL,
    "quotation_number" TEXT,
    "project_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "logical_group_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "supersedes_id" UUID,
    "quotation_date" DATE NOT NULL,
    "valid_until" DATE,
    "currency" VARCHAR(3) NOT NULL,
    "subtotal" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "estimated_cost" DECIMAL(20,4),
    "estimated_margin" DECIMAL(20,4),
    "estimated_margin_percent" DECIMAL(9,6),
    "payment_terms" TEXT,
    "delivery_terms" TEXT,
    "warranty_terms" TEXT,
    "assumptions" TEXT,
    "exclusions" TEXT,
    "notes" TEXT,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "sent_by_id" UUID,
    "sent_to" TEXT,
    "created_by_id" UUID,
    "approved_by_id" UUID,
    "pdf_attachment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "item_no" INTEGER NOT NULL,
    "service_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL DEFAULT 1,
    "unit" TEXT,
    "unit_price" DECIMAL(20,4) NOT NULL,
    "discount_rate" DECIMAL(9,6),
    "discount_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(9,6),
    "tax_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "line_subtotal" DECIMAL(20,4) NOT NULL,
    "line_total" DECIMAL(20,4) NOT NULL,
    "estimated_cost" DECIMAL(20,4),
    "estimated_margin" DECIMAL(20,4),
    "charge_type" "ChargeType" NOT NULL,
    "pricing_basis" "PricingBasis" NOT NULL,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "is_selected" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflows" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "workflow_code" TEXT NOT NULL,
    "workflow_name" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "step_no" INTEGER NOT NULL,
    "step_name" TEXT NOT NULL,
    "required_role_code" TEXT,
    "required_permission_code" TEXT,
    "min_amount" DECIMAL(20,4),
    "max_amount" DECIMAL(20,4),
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "quotation_id" UUID,
    "current_step_no" INTEGER NOT NULL DEFAULT 1,
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_actions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "step_no" INTEGER NOT NULL,
    "action" "ApprovalActionType" NOT NULL,
    "action_by_id" UUID,
    "comments" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_contracts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "role" "ProjectContractRole" NOT NULL DEFAULT 'MAIN',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_activation_conditions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "condition_type" "ActivationConditionType" NOT NULL,
    "description" TEXT,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "status" "ActivationConditionStatus" NOT NULL DEFAULT 'PENDING',
    "satisfied_at" TIMESTAMP(3),
    "satisfied_by_id" UUID,
    "evidence_document_id" UUID,
    "waiver_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_activation_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_billing_schedules" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "project_id" UUID,
    "contract_item_id" UUID,
    "sequence_no" INTEGER NOT NULL,
    "billing_name" TEXT NOT NULL,
    "billing_type" "BillingType" NOT NULL,
    "trigger_type" "BillingTriggerType" NOT NULL,
    "trigger_reference_type" TEXT,
    "trigger_reference_id" UUID,
    "trigger_status" "BillingTriggerStatus" NOT NULL DEFAULT 'PENDING',
    "percentage" DECIMAL(9,6),
    "scheduled_amount" DECIMAL(20,4) NOT NULL,
    "invoiced_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "remaining_billable" DECIMAL(20,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "planned_billing_date" DATE,
    "invoice_due_days" INTEGER,
    "allow_partial_billing" BOOLEAN NOT NULL DEFAULT false,
    "requires_invoice" BOOLEAN NOT NULL DEFAULT true,
    "tax_profile_key" TEXT,
    "fx_rule" "FxRule" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "fixed_fx_rate" DECIMAL(20,8),
    "recurrence" "BillingRecurrence" NOT NULL DEFAULT 'NONE',
    "recurrence_start_date" DATE,
    "recurrence_end_date" DATE,
    "status" "BillingScheduleStatus" NOT NULL DEFAULT 'PENDING_TRIGGER',
    "trigger_met_at" TIMESTAMP(3),
    "trigger_verified_at" TIMESTAMP(3),
    "trigger_verified_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_billing_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_payment_schedules" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "billing_schedule_id" UUID,
    "sequence_no" INTEGER NOT NULL,
    "payment_name" TEXT NOT NULL,
    "percentage" DECIMAL(9,6),
    "scheduled_amount" DECIMAL(20,4) NOT NULL,
    "due_rule" "PaymentDueRule" NOT NULL,
    "due_days" INTEGER,
    "fixed_due_date" DATE,
    "currency" VARCHAR(3) NOT NULL,
    "status" "PaymentScheduleStatus" NOT NULL DEFAULT 'NOT_DUE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_payment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_adjustment_impacts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "adjustment_contract_id" UUID NOT NULL,
    "parent_contract_id" UUID NOT NULL,
    "value_adjustment" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "effective_date" DATE NOT NULL,
    "billing_reconciliation_required" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_adjustment_impacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "recon_code" TEXT NOT NULL,
    "logical_group_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "supersedes_id" UUID,
    "partner_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "period_type" "PeriodType" NOT NULL DEFAULT 'MONTHLY',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "source_type" "ReconciliationSourceType" NOT NULL,
    "source_attachment_id" UUID,
    "source_checksum" TEXT,
    "source_reported_total" DECIMAL(20,4),
    "ocr_raw_json" JSONB,
    "ocr_corrected_json" JSONB,
    "ocr_confidence" DECIMAL(9,6),
    "validated_payload" JSONB,
    "approved_snapshot" JSONB,
    "total_gross_revenue" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total_partner_share" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total_company_share" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total_wht" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total_net_revenue" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'DRAFT',
    "validated_by_id" UUID,
    "validated_at" TIMESTAMP(3),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "reconciliation_id" UUID NOT NULL,
    "contract_service_id" UUID,
    "service_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "market_code" TEXT,
    "channel_code" TEXT,
    "scope_reference" TEXT,
    "business_scope_key" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "gross_revenue" DECIMAL(20,4) NOT NULL,
    "partner_share_rate" DECIMAL(9,6),
    "partner_share_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "company_share_rate" DECIMAL(9,6),
    "company_share_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "wht_rate" DECIMAL(9,6),
    "wht_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(9,6),
    "tax_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "minimum_guarantee_adj" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "net_revenue" DECIMAL(20,4) NOT NULL,
    "source_row_reference" TEXT,
    "validation_json" JSONB,
    "calculation_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_term_snapshots" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "reconciliation_item_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "contract_service_id" UUID,
    "service_id" UUID NOT NULL,
    "effective_date" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "business_model" "BusinessModel" NOT NULL,
    "partner_share_rate" DECIMAL(9,6),
    "company_share_rate" DECIMAL(9,6),
    "fixed_fee" DECIMAL(20,4),
    "minimum_guarantee_amount" DECIMAL(20,4),
    "minimum_guarantee_period" "GuaranteePeriod",
    "wht_rate" DECIMAL(9,6),
    "tax_rate" DECIMAL(9,6),
    "terms_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_term_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenues" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "revenue_code" TEXT NOT NULL,
    "logical_group_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "supersedes_id" UUID,
    "reconciliation_id" UUID NOT NULL,
    "reconciliation_item_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "business_scope_key" TEXT NOT NULL,
    "period_type" "PeriodType" NOT NULL DEFAULT 'MONTHLY',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "gross_amount" DECIMAL(20,4) NOT NULL,
    "partner_share_amount" DECIMAL(20,4) NOT NULL,
    "company_share_amount" DECIMAL(20,4) NOT NULL,
    "wht_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "adjustment_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(20,4) NOT NULL,
    "calculation_json" JSONB,
    "status" "RevenueStatus" NOT NULL DEFAULT 'GENERATED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_scopes" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "scope_code" TEXT NOT NULL,
    "logical_group_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "supersedes_id" UUID,
    "partner_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "period_type" "PeriodType" NOT NULL DEFAULT 'MONTHLY',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "invoice_mode" "InvoiceMode" NOT NULL,
    "scope_key" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "total_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "status" "InvoiceScopeStatus" NOT NULL DEFAULT 'BUILDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_scope_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "scope_id" UUID NOT NULL,
    "revenue_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_scope_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_company_code_key" ON "companies"("company_code");

-- CreateIndex
CREATE INDEX "users_company_id_status_idx" ON "users"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "users_company_id_email_key" ON "users"("company_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_company_id_username_key" ON "users"("company_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "roles_company_id_code_key" ON "roles"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- CreateIndex
CREATE UNIQUE INDEX "configurations_company_id_config_key_key" ON "configurations"("company_id", "config_key");

-- CreateIndex
CREATE UNIQUE INDEX "sequences_company_id_sequence_name_key" ON "sequences"("company_id", "sequence_name");

-- CreateIndex
CREATE INDEX "attachments_company_id_checksum_sha256_idx" ON "attachments"("company_id", "checksum_sha256");

-- CreateIndex
CREATE INDEX "documents_company_id_entity_type_entity_id_idx" ON "documents"("company_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_company_id_document_code_key" ON "documents"("company_id", "document_code");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_entity_type_entity_id_idx" ON "audit_logs"("company_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_created_at_idx" ON "audit_logs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "partners_company_id_legal_name_idx" ON "partners"("company_id", "legal_name");

-- CreateIndex
CREATE INDEX "partners_company_id_tax_code_idx" ON "partners"("company_id", "tax_code");

-- CreateIndex
CREATE INDEX "partners_company_id_status_idx" ON "partners"("company_id", "status");

-- CreateIndex
CREATE INDEX "partners_company_id_owner_user_id_idx" ON "partners"("company_id", "owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "partners_company_id_partner_code_key" ON "partners"("company_id", "partner_code");

-- CreateIndex
CREATE INDEX "partner_contacts_company_id_partner_id_idx" ON "partner_contacts"("company_id", "partner_id");

-- CreateIndex
CREATE INDEX "partner_contacts_partner_id_role_idx" ON "partner_contacts"("partner_id", "role");

-- CreateIndex
CREATE INDEX "partner_bank_accounts_company_id_partner_id_idx" ON "partner_bank_accounts"("company_id", "partner_id");

-- CreateIndex
CREATE INDEX "services_company_id_category_idx" ON "services"("company_id", "category");

-- CreateIndex
CREATE INDEX "services_company_id_status_idx" ON "services"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "services_company_id_service_code_key" ON "services"("company_id", "service_code");

-- CreateIndex
CREATE INDEX "partner_services_company_id_partner_id_service_id_idx" ON "partner_services"("company_id", "partner_id", "service_id");

-- CreateIndex
CREATE INDEX "partner_services_partner_id_service_id_effective_from_effec_idx" ON "partner_services"("partner_id", "service_id", "effective_from", "effective_to");

-- CreateIndex
CREATE INDEX "service_relationships_company_id_parent_service_id_idx" ON "service_relationships"("company_id", "parent_service_id");

-- CreateIndex
CREATE INDEX "service_relationships_company_id_child_service_id_idx" ON "service_relationships"("company_id", "child_service_id");

-- CreateIndex
CREATE INDEX "contracts_company_id_partner_id_idx" ON "contracts"("company_id", "partner_id");

-- CreateIndex
CREATE INDEX "contracts_company_id_status_idx" ON "contracts"("company_id", "status");

-- CreateIndex
CREATE INDEX "contracts_company_id_business_type_idx" ON "contracts"("company_id", "business_type");

-- CreateIndex
CREATE INDEX "contracts_company_id_expiry_date_idx" ON "contracts"("company_id", "expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_company_id_contract_code_key" ON "contracts"("company_id", "contract_code");

-- CreateIndex
CREATE INDEX "contract_parties_company_id_contract_id_idx" ON "contract_parties"("company_id", "contract_id");

-- CreateIndex
CREATE INDEX "contract_items_company_id_contract_id_idx" ON "contract_items"("company_id", "contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_items_contract_id_item_no_key" ON "contract_items"("contract_id", "item_no");

-- CreateIndex
CREATE INDEX "contract_services_company_id_contract_id_service_id_idx" ON "contract_services"("company_id", "contract_id", "service_id");

-- CreateIndex
CREATE INDEX "contract_services_contract_id_service_id_effective_from_eff_idx" ON "contract_services"("contract_id", "service_id", "effective_from", "effective_to");

-- CreateIndex
CREATE INDEX "contract_terms_company_id_contract_id_idx" ON "contract_terms"("company_id", "contract_id");

-- CreateIndex
CREATE INDEX "contract_terms_contract_id_term_key_idx" ON "contract_terms"("contract_id", "term_key");

-- CreateIndex
CREATE UNIQUE INDEX "projects_accepted_quotation_id_key" ON "projects"("accepted_quotation_id");

-- CreateIndex
CREATE INDEX "projects_company_id_partner_id_idx" ON "projects"("company_id", "partner_id");

-- CreateIndex
CREATE INDEX "projects_company_id_owner_user_id_idx" ON "projects"("company_id", "owner_user_id");

-- CreateIndex
CREATE INDEX "projects_company_id_status_idx" ON "projects"("company_id", "status");

-- CreateIndex
CREATE INDEX "projects_company_id_expected_close_date_idx" ON "projects"("company_id", "expected_close_date");

-- CreateIndex
CREATE UNIQUE INDEX "projects_company_id_project_code_key" ON "projects"("company_id", "project_code");

-- CreateIndex
CREATE INDEX "project_qualifications_company_id_project_id_is_current_idx" ON "project_qualifications"("company_id", "project_id", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "project_qualifications_project_id_revision_no_key" ON "project_qualifications"("project_id", "revision_no");

-- CreateIndex
CREATE INDEX "project_activities_company_id_project_id_activity_date_idx" ON "project_activities"("company_id", "project_id", "activity_date");

-- CreateIndex
CREATE INDEX "project_activities_company_id_next_action_date_idx" ON "project_activities"("company_id", "next_action_date");

-- CreateIndex
CREATE INDEX "quotations_company_id_project_id_idx" ON "quotations"("company_id", "project_id");

-- CreateIndex
CREATE INDEX "quotations_company_id_partner_id_idx" ON "quotations"("company_id", "partner_id");

-- CreateIndex
CREATE INDEX "quotations_company_id_status_idx" ON "quotations"("company_id", "status");

-- CreateIndex
CREATE INDEX "quotations_logical_group_id_is_current_idx" ON "quotations"("logical_group_id", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_company_id_quotation_code_revision_no_key" ON "quotations"("company_id", "quotation_code", "revision_no");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_logical_group_id_revision_no_key" ON "quotations"("logical_group_id", "revision_no");

-- CreateIndex
CREATE INDEX "quotation_items_company_id_quotation_id_idx" ON "quotation_items"("company_id", "quotation_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_items_quotation_id_item_no_key" ON "quotation_items"("quotation_id", "item_no");

-- CreateIndex
CREATE INDEX "approval_workflows_company_id_entity_type_idx" ON "approval_workflows"("company_id", "entity_type");

-- CreateIndex
CREATE UNIQUE INDEX "approval_workflows_company_id_workflow_code_key" ON "approval_workflows"("company_id", "workflow_code");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_workflow_id_step_no_key" ON "approval_steps"("workflow_id", "step_no");

-- CreateIndex
CREATE INDEX "approval_requests_company_id_entity_type_entity_id_idx" ON "approval_requests"("company_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "approval_requests_company_id_status_idx" ON "approval_requests"("company_id", "status");

-- CreateIndex
CREATE INDEX "approval_actions_company_id_request_id_idx" ON "approval_actions"("company_id", "request_id");

-- CreateIndex
CREATE INDEX "project_contracts_company_id_project_id_idx" ON "project_contracts"("company_id", "project_id");

-- CreateIndex
CREATE INDEX "project_contracts_company_id_contract_id_idx" ON "project_contracts"("company_id", "contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_contracts_project_id_contract_id_key" ON "project_contracts"("project_id", "contract_id");

-- CreateIndex
CREATE INDEX "contract_activation_conditions_company_id_contract_id_statu_idx" ON "contract_activation_conditions"("company_id", "contract_id", "status");

-- CreateIndex
CREATE INDEX "contract_billing_schedules_company_id_contract_id_status_idx" ON "contract_billing_schedules"("company_id", "contract_id", "status");

-- CreateIndex
CREATE INDEX "contract_billing_schedules_company_id_project_id_idx" ON "contract_billing_schedules"("company_id", "project_id");

-- CreateIndex
CREATE INDEX "contract_billing_schedules_contract_item_id_idx" ON "contract_billing_schedules"("contract_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_billing_schedules_contract_id_sequence_no_key" ON "contract_billing_schedules"("contract_id", "sequence_no");

-- CreateIndex
CREATE INDEX "contract_payment_schedules_company_id_contract_id_status_idx" ON "contract_payment_schedules"("company_id", "contract_id", "status");

-- CreateIndex
CREATE INDEX "contract_payment_schedules_billing_schedule_id_idx" ON "contract_payment_schedules"("billing_schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_payment_schedules_contract_id_sequence_no_key" ON "contract_payment_schedules"("contract_id", "sequence_no");

-- CreateIndex
CREATE UNIQUE INDEX "contract_adjustment_impacts_adjustment_contract_id_key" ON "contract_adjustment_impacts"("adjustment_contract_id");

-- CreateIndex
CREATE INDEX "contract_adjustment_impacts_company_id_parent_contract_id_idx" ON "contract_adjustment_impacts"("company_id", "parent_contract_id");

-- CreateIndex
CREATE INDEX "reconciliations_company_id_partner_id_period_start_period_e_idx" ON "reconciliations"("company_id", "partner_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "reconciliations_company_id_status_idx" ON "reconciliations"("company_id", "status");

-- CreateIndex
CREATE INDEX "reconciliations_logical_group_id_is_current_idx" ON "reconciliations"("logical_group_id", "is_current");

-- CreateIndex
CREATE INDEX "reconciliations_source_checksum_idx" ON "reconciliations"("source_checksum");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliations_company_id_recon_code_revision_no_key" ON "reconciliations"("company_id", "recon_code", "revision_no");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliations_logical_group_id_revision_no_key" ON "reconciliations"("logical_group_id", "revision_no");

-- CreateIndex
CREATE INDEX "reconciliation_items_company_id_business_scope_key_idx" ON "reconciliation_items"("company_id", "business_scope_key");

-- CreateIndex
CREATE INDEX "reconciliation_items_reconciliation_id_service_id_idx" ON "reconciliation_items"("reconciliation_id", "service_id");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_items_reconciliation_id_line_no_key" ON "reconciliation_items"("reconciliation_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_term_snapshots_reconciliation_item_id_key" ON "commercial_term_snapshots"("reconciliation_item_id");

-- CreateIndex
CREATE INDEX "commercial_term_snapshots_company_id_contract_id_idx" ON "commercial_term_snapshots"("company_id", "contract_id");

-- CreateIndex
CREATE INDEX "revenues_company_id_business_scope_key_period_start_period__idx" ON "revenues"("company_id", "business_scope_key", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "revenues_company_id_status_idx" ON "revenues"("company_id", "status");

-- CreateIndex
CREATE INDEX "revenues_reconciliation_item_id_idx" ON "revenues"("reconciliation_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "revenues_company_id_revenue_code_revision_no_key" ON "revenues"("company_id", "revenue_code", "revision_no");

-- CreateIndex
CREATE UNIQUE INDEX "revenues_logical_group_id_revision_no_key" ON "revenues"("logical_group_id", "revision_no");

-- CreateIndex
CREATE INDEX "invoice_scopes_company_id_partner_id_period_start_period_en_idx" ON "invoice_scopes"("company_id", "partner_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "invoice_scopes_company_id_status_idx" ON "invoice_scopes"("company_id", "status");

-- CreateIndex
CREATE INDEX "invoice_scopes_scope_key_is_current_idx" ON "invoice_scopes"("scope_key", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_scopes_company_id_scope_code_revision_no_key" ON "invoice_scopes"("company_id", "scope_code", "revision_no");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_scopes_logical_group_id_revision_no_key" ON "invoice_scopes"("logical_group_id", "revision_no");

-- CreateIndex
CREATE INDEX "invoice_scope_items_company_id_revenue_id_idx" ON "invoice_scope_items"("company_id", "revenue_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_scope_items_scope_id_revenue_id_key" ON "invoice_scope_items"("scope_id", "revenue_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_scope_items_scope_id_line_no_key" ON "invoice_scope_items"("scope_id", "line_no");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configurations" ADD CONSTRAINT "configurations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_bank_accounts" ADD CONSTRAINT "partner_bank_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_bank_accounts" ADD CONSTRAINT "partner_bank_accounts_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_services" ADD CONSTRAINT "partner_services_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_services" ADD CONSTRAINT "partner_services_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_services" ADD CONSTRAINT "partner_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_relationships" ADD CONSTRAINT "service_relationships_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_relationships" ADD CONSTRAINT "service_relationships_parent_service_id_fkey" FOREIGN KEY ("parent_service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_relationships" ADD CONSTRAINT "service_relationships_child_service_id_fkey" FOREIGN KEY ("child_service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_parent_contract_id_fkey" FOREIGN KEY ("parent_contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_source_project_id_fkey" FOREIGN KEY ("source_project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_source_quotation_id_fkey" FOREIGN KEY ("source_quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_official_document_id_fkey" FOREIGN KEY ("official_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_source_quotation_item_id_fkey" FOREIGN KEY ("source_quotation_item_id") REFERENCES "quotation_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_services" ADD CONSTRAINT "contract_services_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_services" ADD CONSTRAINT "contract_services_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_services" ADD CONSTRAINT "contract_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_terms" ADD CONSTRAINT "contract_terms_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_terms" ADD CONSTRAINT "contract_terms_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_accepted_quotation_id_fkey" FOREIGN KEY ("accepted_quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_qualifications" ADD CONSTRAINT "project_qualifications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_qualifications" ADD CONSTRAINT "project_qualifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_qualifications" ADD CONSTRAINT "project_qualifications_qualified_by_id_fkey" FOREIGN KEY ("qualified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_pdf_attachment_id_fkey" FOREIGN KEY ("pdf_attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "approval_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_action_by_id_fkey" FOREIGN KEY ("action_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_activation_conditions" ADD CONSTRAINT "contract_activation_conditions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_activation_conditions" ADD CONSTRAINT "contract_activation_conditions_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_activation_conditions" ADD CONSTRAINT "contract_activation_conditions_satisfied_by_id_fkey" FOREIGN KEY ("satisfied_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_activation_conditions" ADD CONSTRAINT "contract_activation_conditions_evidence_document_id_fkey" FOREIGN KEY ("evidence_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_billing_schedules" ADD CONSTRAINT "contract_billing_schedules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_billing_schedules" ADD CONSTRAINT "contract_billing_schedules_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_billing_schedules" ADD CONSTRAINT "contract_billing_schedules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_billing_schedules" ADD CONSTRAINT "contract_billing_schedules_contract_item_id_fkey" FOREIGN KEY ("contract_item_id") REFERENCES "contract_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_billing_schedules" ADD CONSTRAINT "contract_billing_schedules_trigger_verified_by_id_fkey" FOREIGN KEY ("trigger_verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_schedules" ADD CONSTRAINT "contract_payment_schedules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_schedules" ADD CONSTRAINT "contract_payment_schedules_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_schedules" ADD CONSTRAINT "contract_payment_schedules_billing_schedule_id_fkey" FOREIGN KEY ("billing_schedule_id") REFERENCES "contract_billing_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_adjustment_impacts" ADD CONSTRAINT "contract_adjustment_impacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_adjustment_impacts" ADD CONSTRAINT "contract_adjustment_impacts_adjustment_contract_id_fkey" FOREIGN KEY ("adjustment_contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_adjustment_impacts" ADD CONSTRAINT "contract_adjustment_impacts_parent_contract_id_fkey" FOREIGN KEY ("parent_contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_source_attachment_id_fkey" FOREIGN KEY ("source_attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_validated_by_id_fkey" FOREIGN KEY ("validated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "reconciliations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_contract_service_id_fkey" FOREIGN KEY ("contract_service_id") REFERENCES "contract_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_term_snapshots" ADD CONSTRAINT "commercial_term_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_term_snapshots" ADD CONSTRAINT "commercial_term_snapshots_reconciliation_item_id_fkey" FOREIGN KEY ("reconciliation_item_id") REFERENCES "reconciliation_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_term_snapshots" ADD CONSTRAINT "commercial_term_snapshots_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_term_snapshots" ADD CONSTRAINT "commercial_term_snapshots_contract_service_id_fkey" FOREIGN KEY ("contract_service_id") REFERENCES "contract_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_term_snapshots" ADD CONSTRAINT "commercial_term_snapshots_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "reconciliations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_reconciliation_item_id_fkey" FOREIGN KEY ("reconciliation_item_id") REFERENCES "reconciliation_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "revenues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_scopes" ADD CONSTRAINT "invoice_scopes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_scopes" ADD CONSTRAINT "invoice_scopes_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_scopes" ADD CONSTRAINT "invoice_scopes_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_scopes" ADD CONSTRAINT "invoice_scopes_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "invoice_scopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_scope_items" ADD CONSTRAINT "invoice_scope_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_scope_items" ADD CONSTRAINT "invoice_scope_items_scope_id_fkey" FOREIGN KEY ("scope_id") REFERENCES "invoice_scopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_scope_items" ADD CONSTRAINT "invoice_scope_items_revenue_id_fkey" FOREIGN KEY ("revenue_id") REFERENCES "revenues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
