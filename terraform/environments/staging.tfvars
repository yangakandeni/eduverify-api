# Staging environment — deployed into the eduverify-api-staging AWS account (228615802615),
# a dedicated new account for this API (superseding the original plan of building
# same-account-as-eduverify first, then migrating later — the user created the new accounts
# upfront, so ingestion+data were migrated into eduverify-api-staging directly via
# eduverify/terraform/data-stack, and this stack now deploys into that SAME account,
# reading that SAME-account table — no cross-account IAM anywhere).
# Apply with:
#   aws sso login --profile eduverify-api-staging
#   npm run build   (from the repo root — produces dist/index.cjs the Lambda module zips up)
#   AWS_PROFILE=eduverify-api-staging terraform init -backend-config=environments/staging.backend.hcl
#   AWS_PROFILE=eduverify-api-staging terraform plan -var-file=environments/staging.tfvars

environment  = "staging"
project_name = "eduverify-api-staging"
stage_name   = "staging"

# The table eduverify/terraform/data-stack created and seeded in THIS account — same
# account as this Lambda deploys into, so no cross-account IAM is needed.
dynamodb_table_name = "eduverify-api-staging-institutions"
dynamodb_table_arn  = "arn:aws:dynamodb:af-south-1:228615802615:table/eduverify-api-staging-institutions"
dynamodb_gsi_arn    = "arn:aws:dynamodb:af-south-1:228615802615:table/eduverify-api-staging-institutions/index/GSI1"

# First internal key: EduVerify's own server-to-server calls (Part 3's cutover target),
# unlimited/internal tier. api_key_tiers_json intentionally left at its "{}" default here —
# see variables.tf's bootstrap-sequence note; wire the real generated key value in as a
# second step after the first apply.
api_keys = [
  { name = "eduverify-internal-staging", tier = "internal" }
]

log_retention_days = 7

# CD (see .github/workflows/cd.yml) assumes this role via OIDC to deploy on manual
# workflow_dispatch runs from the "staging" branch. Same bucket/table named in
# staging.backend.hcl — duplicated here because backend config isn't readable as a variable.
github_deploy_refs   = ["refs/heads/staging"]
tf_state_bucket_name = "eduverify-api-staging-tfstate-228615802615"
tf_lock_table_name   = "eduverify-api-staging-tf-locks"
