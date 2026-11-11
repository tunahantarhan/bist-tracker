"""Clears an admin's TOTP enrolment from the command line (recovery when no other admin can).

Usage (from backend/):  python -m app.scripts.reset_admin_2fa admin@example.com
"""

import asyncio
import sys

from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.models.user import User


async def main(email: str) -> int:
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(func.lower(User.email) == email.lower()))).scalar_one_or_none()
        if user is None:
            print(f"No user with e-mail {email}")
            return 1
        user.totp_secret = None
        user.totp_enabled = False
        user.totp_last_counter = None
        user.token_version += 1
        await db.commit()
        print(f"2FA reset for {user.email}; they will enrol again on the next admin sign-in.")
        return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(asyncio.run(main(sys.argv[1])))
