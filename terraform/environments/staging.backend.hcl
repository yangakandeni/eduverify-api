# Partial backend configuration for the staging environment. Used via:
#   AWS_PROFILE=eduverify-api-staging terraform init -backend-config=environments/staging.backend.hcl
#
# Reuses the SAME bucket/lock table that eduverify/terraform/data-stack's backend_state.tf
# bootstrapped in this account (eduverify-api-staging-tfstate-228615802615 /
# eduverify-api-staging-tf-locks) — this repo doesn't need its own state bucket bootstrapped
# in this account either; it just uses a different `key` so the two stacks' state files
# never collide.

bucket         = "eduverify-api-staging-tfstate-228615802615"
key            = "eduverify-api/staging/terraform.tfstate"
region         = "af-south-1"
dynamodb_table = "eduverify-api-staging-tf-locks"
encrypt        = true
