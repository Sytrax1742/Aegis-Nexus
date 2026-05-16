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


WORKFLOW_IDS = {
    "KNOWLEDGE_INGESTION": "019e3056-6682-7000-81db-57be3cd39779",
    "LEAD_INTEL": "019e3095-3378-7000-81f1-6f5dfee4b6ea",
    "POLICY_GUARD": "019e306a-34a6-7000-ab83-01ed37ef91a4",
    "CRM_OPS": "019e307e-2f53-7000-a9c8-25ae89119cf9",
    "DOC_OPS": "019e3089-2ae9-7000-90c5-f6e1e1269002",
    "COMMS_OPS": "019e308d-dd05-7000-b8ae-2035b6e5b65c"
}


class SupervityService:
    """
    Async client for Supervity AI workflow execution.
    
    Handles authentication, request formatting, and API communication
    with the Supervity auto-workflow engine.
    """

    BASE_URL = "https://auto-workflow-api.supervity.ai/api/v1/workflow-runs/execute/stream"

    def __init__(self):
        """Initialize the Supervity service with API token from environment."""
        self.token = os.getenv("SUPERVITY_TOKEN")
        if not self.token:
            log.warning("SUPERVITY_TOKEN not set. Supervity workflows will not be executed.")
        else:
            log.info("SupervityService initialized with SUPERVITY_TOKEN")

    async def execute_workflow(
        self,
        workflow_id: str,
        inputs: dict,
        files: dict = None,
    ) -> dict:
        """
        Execute a workflow on the Supervity AI engine.

        This method sends a multipart/form-data request to the Supervity API
        with the workflow ID and input parameters, then returns the parsed JSON response.
        
        Supports large string contents (e.g., document text) via form fields.
        Supports file uploads alongside string inputs.

        Args:
            workflow_id: The ID of the workflow to execute (e.g., "policy_audit_v1")
            inputs: Dictionary of input parameters to pass to the workflow
            files: Optional dictionary of files to upload (e.g., {"policy": file_object})

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
            # Cast all values to strings to ensure proper multipart encoding
            for key, value in inputs.items():
                form_field_name = f"inputs[{key}]"
                # Handle large string contents (documents, transcripts, etc.)
                if isinstance(value, (str, bytes)):
                    # Convert bytes to string if needed
                    if isinstance(value, bytes):
                        form_data[form_field_name] = value.decode("utf-8")
                    else:
                        form_data[form_field_name] = value
                else:
                    # For other types (dict, list, etc.), convert to string
                    form_data[form_field_name] = str(value)

            # Prepare headers
            headers = {
                "Authorization": f"Bearer {self.token}",
                "x-source": "v1",
            }

            log.debug(f"Sending request to {self.BASE_URL} with workflow {workflow_id}")

            # Execute async HTTP request with 120 second timeout for document processing
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    self.BASE_URL,
                    data=form_data,
                    files=files,
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

    async def resume_workflow(
        self,
        run_id: str,
        input_data: dict,
    ) -> dict:
        """
        Resume a paused workflow by submitting human input.

        This method sends a POST request to the Supervity resume endpoint
        to continue a workflow that was paused and awaiting human input.

        Args:
            run_id: The ID of the workflow run to resume
            input_data: Dictionary of input data to submit to the workflow

        Returns:
            dict: Parsed JSON response from the Supervity API

        Raises:
            ValueError: If SUPERVITY_TOKEN is not configured
            httpx.HTTPError: If the API request fails
        """

        if not self.token:
            error_msg = "SUPERVITY_TOKEN not configured. Cannot resume workflow."
            log.error(error_msg)
            raise ValueError(error_msg)

        log.info(f"Resuming Supervity workflow: {run_id}")

        try:
            # Build the resume URL
            resume_url = f"https://auto-workflow-api.supervity.ai/api/v1/workflow-runs/{run_id}/resume"

            # Prepare headers
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
                "x-source": "v1",
            }

            log.debug(f"Sending resume request to {resume_url}")

            # Execute async HTTP request with 120 second timeout for workflow processing
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    resume_url,
                    json=input_data,
                    headers=headers,
                )

                # Check for HTTP errors
                response.raise_for_status()

                # Parse and return JSON response
                result = response.json()
                log.info(f"Workflow {run_id} resumed successfully")
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
            error_msg = f"Unexpected error resuming Supervity workflow: {str(e)}"
            log.error(error_msg)
            raise


# Global service instance
supervity_service = SupervityService()
