environment  = "staging"
project_name = "eduverify-api-staging"
stage_name   = "staging"

# The table eduverify/terraform/data-stack created and seeded in THIS account — same
# account as this Lambda deploys into, so no cross-account IAM is needed.
dynamodb_table_name = "eduverify-api-staging-institutions"
dynamodb_table_arn  = "arn:aws:dynamodb:af-south-1:228615802615:table/eduverify-api-staging-institutions"
dynamodb_gsi_arn    = "arn:aws:dynamodb:af-south-1:228615802615:table/eduverify-api-staging-institutions/index/GSI1"

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
