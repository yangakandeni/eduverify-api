# Production environment — deployed into the eduverify-api-prod AWS account (924285051814).
# Mirrors staging.tfvars exactly, different account/names — see that file's comment for the
# overall account-topology rationale.
# Apply with:
#   aws sso login --profile eduverify-api-prod
#   npm run build   (from the repo root — produces dist/index.cjs the Lambda module zips up)
#   AWS_PROFILE=eduverify-api-prod terraform init -backend-config=environments/production.backend.hcl
#   AWS_PROFILE=eduverify-api-prod terraform plan -var-file=environments/production.tfvars

environment  = "production"
project_name = "eduverify-api-prod"
stage_name   = "production"

# The table eduverify/terraform/data-stack created and seeded in THIS account.
dynamodb_table_name = "eduverify-api-prod-institutions"
dynamodb_table_arn  = "arn:aws:dynamodb:af-south-1:924285051814:table/eduverify-api-prod-institutions"
dynamodb_gsi_arn    = "arn:aws:dynamodb:af-south-1:924285051814:table/eduverify-api-prod-institutions/index/GSI1"

# First internal key: EduVerify's own server-to-server calls (Part 3's cutover target),
# unlimited/internal tier.
api_keys = [
  { name = "eduverify-internal-production", tier = "internal" }
]

log_retention_days = 30

# CD (see .github/workflows/cd.yml) assumes this role via OIDC to deploy on manual
# workflow_dispatch runs from the "main" branch. Same bucket/table named in
# production.backend.hcl — duplicated here because backend config isn't readable as a variable.
github_deploy_refs   = ["refs/heads/main"]
tf_state_bucket_name = "eduverify-api-prod-tfstate-924285051814"
tf_lock_table_name   = "eduverify-api-prod-tf-locks"
