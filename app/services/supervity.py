"""
Supervity AI Engine Integration Service

This service provides an async client for interacting with the Supervity AI API.
It handles workflow execution, request formatting, and error handling.
"""

import httpx
import logging
import os
from typing import Optional

log = logging.getLogger(__name__)


class SupervityClient:
    """
    Async client for Supervity AI workflow execution.
    
    Handles authentication, request formatting, and API communication
    with the Supervity auto-workflow engine.
    """

    BASE_URL = "https://auto-workflow-api.supervity.ai/api/v1/workflow-runs/execute/stream"

    def __init__(self):
        """Initialize the Supervity client with API token from environment."""
        self.token = os.getenv("SUPERVITY_TOKEN")
        if not self.token:
            log.warning("SUPERVITY_TOKEN not set. Supervity workflows will not be executed.")
        else:
            log.info("SupervityClient initialized with SUPERVITY_TOKEN")

    async def execute_workflow(
        self,
        workflow_id: str,
        inputs: dict,
    ) -> dict:
        """
        Execute a workflow on the Supervity AI engine.

        This method sends a multipart/form-data request to the Supervity API
        with the workflow ID and input parameters, then returns the parsed JSON response.

        Args:
            workflow_id: The ID of the workflow to execute (e.g., "policy_audit_v1")
            inputs: Dictionary of input parameters to pass to the workflow

        Returns:
            dict: Parsed JSON response from the Supervity API

        Raises:
            ValueError: If SUPERVITY_TOKEN is not configured
            httpx.HTTPError: If the API request fails
        """

        if not self.token:
            error_msg = "SUPERVITY_TOKEN not configured. Cannot execute workflow."
            log.error(error_msg)
            raise ValueError(error_msg)

        log.info(f"Executing Supervity workflow: {workflow_id}")

        try:
            # Prepare multipart form data
            form_data = {
                "workflowId": workflow_id,
            }

            # Add all inputs as form fields (formatted as inputs[key] = value)
            for key, value in inputs.items():
                form_field_name = f"inputs[{key}]"
                form_data[form_field_name] = str(value)

            # Prepare headers
            headers = {
                "Authorization": f"Bearer {self.token}",
                "x-source": "v1",
            }

            log.debug(f"Sending request to {self.BASE_URL} with workflow {workflow_id}")

            # Execute async HTTP request
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    self.BASE_URL,
                    data=form_data,
                    headers=headers,
                )

                # Check for HTTP errors
                response.raise_for_status()

                # Parse and return JSON response
                result = response.json()
                log.info(f"Workflow {workflow_id} executed successfully")
                return result

        except httpx.HTTPStatusError as e:
            error_msg = f"Supervity API error (status {e.response.status_code}): {e.response.text}"
            log.error(error_msg)
            raise

        except httpx.RequestError as e:
            error_msg = f"Supervity API request failed: {str(e)}"
            log.error(error_msg)
            raise

        except Exception as e:
            error_msg = f"Unexpected error executing Supervity workflow: {str(e)}"
            log.error(error_msg)
            raise


# Global client instance
supervity_client = SupervityClient()
