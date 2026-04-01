import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from app.config import get_settings
import os
import logging

logger = logging.getLogger(__name__)

_firebase_app = None


def init_firebase():
    global _firebase_app
    if _firebase_app:
        return _firebase_app

    settings = get_settings()
    cred_path = settings.firebase_service_account_key

    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        _firebase_app = firebase_admin.initialize_app(cred)
        logger.info("Firebase initialized with service account key")
    elif settings.firebase_project_id:
        # No service account file — initialize with project ID only.
        # Firebase Admin can still verify ID tokens using the public cert endpoint.
        _firebase_app = firebase_admin.initialize_app(
            options={"projectId": settings.firebase_project_id}
        )
        logger.info(f"Firebase initialized with project ID: {settings.firebase_project_id}")
    else:
        try:
            _firebase_app = firebase_admin.initialize_app()
            logger.info("Firebase initialized with application default credentials")
        except Exception as e:
            logger.error(
                f"Firebase initialization failed: {e}. "
                "Set FIREBASE_PROJECT_ID in .env or place firebase-service-account.json in backend/."
            )
            _firebase_app = None

    return _firebase_app


async def verify_firebase_token(id_token: str) -> dict | None:
    """Verify a Firebase ID token and return the decoded claims."""
    if not _firebase_app:
        init_firebase()

    if not _firebase_app:
        logger.warning("Firebase not initialized, skipping token verification")
        return None

    try:
        decoded_token = firebase_auth.verify_id_token(id_token)
        return decoded_token
    except firebase_auth.InvalidIdTokenError:
        logger.warning("Invalid Firebase ID token")
        return None
    except firebase_auth.ExpiredIdTokenError:
        logger.warning("Expired Firebase ID token")
        return None
    except Exception as e:
        logger.error(f"Firebase token verification error: {e}")
        return None
