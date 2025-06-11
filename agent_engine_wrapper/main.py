from agent_development_kit import Agent, Tool
from agent_development_kit.deployment import agent_engines
import os
import requests
import google.auth
import google.auth.transport.requests

# --- Environment Variable Check ---
# The URL of the deployed Node.js agent on Cloud Run
CSA_AGENT_URL = os.environ.get("CSA_AGENT_URL")

# --- Tool Definition ---

class CsaAgentTool(Tool):
    """
    A tool to invoke the core Node.js Customer Support Agent.
    This tool securely calls the Cloud Run service where the main agent is deployed.
    """
    def __init__(self):
        super().__init__(
            name="invoke_csa_agent",
            description="Forwards the user's request to the main customer support agent for processing.",
            input_schema={
                "type": "object",
                "properties": {
                    "user_input": {"type": "string", "description": "The user's original message."},
                    "thread_id": {"type": "string", "description": "The unique ID for the conversation."}
                },
                "required": ["user_input", "thread_id"],
            },
        )

    def _get_gcp_auth_token(self, audience):
        """Generates a GCP-signed OIDC token for authenticating to Cloud Run."""
        try:
            creds, project = google.auth.default()
            auth_req = google.auth.transport.requests.Request()
            creds.refresh(auth_req)
            # The audience must be the full URL of the receiving service.
            return creds.token
        except Exception as e:
            print(f"Error getting GCP auth token: {e}")
            raise RuntimeError("Failed to get authentication token for Cloud Run.") from e

    def __call__(self, user_input: str, thread_id: str):
        if not CSA_AGENT_URL:
            raise ValueError("CSA_AGENT_URL environment variable is not set.")

        print(f"Invoking CSA Agent at {CSA_AGENT_URL} for thread {thread_id}...")

        try:
            # 1. Get auth token for the Cloud Run service
            # For local testing, you might comment this out if the service is public
            token = self._get_gcp_auth_token(audience=CSA_AGENT_URL)
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }

            # 2. Prepare the payload
            payload = {
                "userInput": user_input,
                "threadId": thread_id
            }

            # 3. Make the authenticated request
            response = requests.post(CSA_AGENT_URL, json=payload, headers=headers, timeout=300)
            response.raise_for_status()

            # 4. Return the response from the Node.js agent
            agent_response = response.json()
            print("Successfully received response from CSA Agent.")
            return agent_response.get("final_response", "No response content found.")

        except requests.exceptions.HTTPError as http_err:
            print(f"HTTP error occurred: {http_err} - {http_err.response.text}")
            return f"Error: The agent service returned an error: {http_err.response.status_code}"
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            return "An unexpected error occurred while contacting the agent service."

# --- Agent Definition ---

csa_tool = CsaAgentTool()

# This is the main agent that will be deployed on Agent Engine.
# Its only job is to call the single tool.
hybrid_agent = Agent(
    model="gemini-2.0-flash-001",
    tools=[csa_tool],
    system_instructions="""You are a simple router. Your only task is to receive the user's message and the conversation's thread_id and immediately call the `invoke_csa_agent` tool with the exact same inputs. Do not modify the input or try to answer the user directly.""",
)

# --- Deployment Configuration (Optional, can be configured on deploy) ---

def deploy_agent():
    """Deploys the agent to Google Cloud Agent Engine."""
    if not CSA_AGENT_URL:
        print("Cannot deploy: CSA_AGENT_URL environment variable must be set.")
        return

    print("Starting deployment of the hybrid wrapper agent...")

    remote_agent = agent_engines.create(
        hybrid_agent,
        display_name="CSA Hybrid Wrapper Agent",
        description="A lightweight wrapper that calls the main Node.js agent on Cloud Run.",
        gcs_dir_name="csa_hybrid_wrapper_deployment",
        env_vars={
            "CSA_AGENT_URL": CSA_AGENT_URL
        }
    )
    print(f"Agent deployed successfully! Resource name: {remote_agent.resource_name}")
    return remote_agent

if __name__ == "__main__":
    # This allows for manual deployment by running `python main.py`
    # Ensure you are authenticated with `gcloud auth application-default login`
    # and have set the `CSA_AGENT_URL` environment variable.
    if os.environ.get("DEPLOY_AGENT", "").lower() == "true":
        deploy_agent()
    else:
        print("To deploy, set the DEPLOY_AGENT environment variable to 'true'.")
        print("Example: DEPLOY_AGENT=true CSA_AGENT_URL=<your_cloud_run_url> python main.py") 