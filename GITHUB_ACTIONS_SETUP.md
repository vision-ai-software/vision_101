# GitHub Actions Authentication Setup for Google Cloud

## Problem
Error: `google-github-actions/auth failed with: the GitHub Action workflow must specify exactly one of "workload_identity_provider" or "credentials_json"`

## Solutions

### Option 1: Workload Identity Federation (Recommended - More Secure)

#### Step 1: Set up Workload Identity Federation in Google Cloud

1. **Create a Workload Identity Pool**:
```bash
gcloud iam workload-identity-pools create "github-pool" \
  --project="YOUR_PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool"
```

2. **Create a Workload Identity Provider**:
```bash
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="YOUR_PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Actions Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

3. **Create a Service Account** (if you don't have one):
```bash
gcloud iam service-accounts create github-actions-sa \
  --display-name="GitHub Actions Service Account" \
  --project="YOUR_PROJECT_ID"
```

4. **Grant necessary roles to the service account**:
```bash
# Cloud Build Editor
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

# Cloud Run Admin
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# Service Account User
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Storage Admin (for container images)
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"
```

5. **Allow the Workload Identity Pool to impersonate the service account**:
```bash
gcloud iam service-accounts add-iam-policy-binding \
  "github-actions-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --project="YOUR_PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME"
```

**Note**: Replace `PROJECT_NUMBER` with your actual project number (not project ID). You can find it with:
```bash
gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)"
```

#### Step 2: Configure GitHub Repository Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions, and add these secrets:

1. **GCP_WORKLOAD_IDENTITY_PROVIDER**:
   ```
   projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider
   ```

2. **GCP_SERVICE_ACCOUNT**:
   ```
   github-actions-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
   ```

3. **GCP_PROJECT_ID**:
   ```
   YOUR_PROJECT_ID
   ```

### Option 2: Service Account JSON (Alternative - Less Secure)

If you prefer to use a service account key file:

#### Step 1: Create and Download Service Account Key

1. **Create a service account** (if you don't have one):
```bash
gcloud iam service-accounts create github-actions-sa \
  --display-name="GitHub Actions Service Account" \
  --project="YOUR_PROJECT_ID"
```

2. **Grant necessary roles** (same as above in Option 1, step 4)

3. **Create and download the key**:
```bash
gcloud iam service-accounts keys create key.json \
  --iam-account=github-actions-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

#### Step 2: Configure GitHub Repository Secrets

Add these secrets to your GitHub repository:

1. **GCP_SERVICE_ACCOUNT_KEY**: The entire content of the `key.json` file
2. **GCP_PROJECT_ID**: Your Google Cloud project ID

#### Step 3: Update GitHub Actions Workflow

If using this option, update your `.github/workflows/main.yml`:

```yaml
- name: Authenticate to Google Cloud
  id: auth
  uses: 'google-github-actions/auth@v2'
  with:
    credentials_json: '${{ secrets.GCP_SERVICE_ACCOUNT_KEY }}'
    create_credentials_file: true
```

## Troubleshooting

### Common Issues and Solutions

1. **"Invalid JWT" errors**:
   - Ensure your repository is not a fork
   - Check that the repository name in the workload identity binding matches exactly

2. **"Permission denied" errors**:
   - Verify all IAM roles are properly assigned
   - Check that the service account has the necessary permissions

3. **"Project not found" errors**:
   - Ensure `GCP_PROJECT_ID` secret contains the correct project ID
   - Verify the service account belongs to the correct project

4. **"Workload Identity Pool not found"**:
   - Double-check the `GCP_WORKLOAD_IDENTITY_PROVIDER` secret format
   - Ensure you're using PROJECT_NUMBER (not PROJECT_ID) in the provider path

### Testing Authentication

You can test your setup locally using the GitHub CLI:

```bash
# Install GitHub CLI if not already installed
# Then generate a token for testing
gh auth token | gcloud auth login --cred-file=/dev/stdin
```

### Security Best Practices

1. **Use Workload Identity Federation** instead of service account keys when possible
2. **Limit service account permissions** to only what's necessary
3. **Use repository-specific bindings** in Workload Identity Federation
4. **Regularly rotate service account keys** if using Option 2
5. **Never commit service account keys** to your repository

## Verification Steps

After setup, your GitHub Actions should:

1. Successfully authenticate to Google Cloud
2. List the authenticated account in the "Verify authentication" step
3. Submit builds to Cloud Build without permission errors

## Additional Resources

- [Google Cloud Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)
- [GitHub Actions OIDC](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [google-github-actions/auth documentation](https://github.com/google-github-actions/auth) 