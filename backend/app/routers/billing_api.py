"""Stripe Checkout + webhooks (Stage 12)."""

from __future__ import annotations

import os
from typing import Any

import stripe
from fastapi import APIRouter, HTTPException, Request

from app.db import get_user_by_id, update_user_plan, update_user_stripe_ids
from app.feature_flags import user_auth_enabled

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


def _stripe_enabled() -> bool:
    return bool(os.getenv("STRIPE_SECRET_KEY", "").strip())


@router.post("/checkout-session")
async def create_checkout_session(request: Request) -> dict[str, Any]:
    if not user_auth_enabled():
        raise HTTPException(status_code=503, detail="Billing requires KALSHIBOT_USER_AUTH=1.")
    if not _stripe_enabled():
        raise HTTPException(status_code=503, detail="Stripe is not configured (STRIPE_SECRET_KEY).")

    uid = int(getattr(request.state, "user_id", 0))
    if uid <= 0:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    user = get_user_by_id(uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
    price = os.getenv("STRIPE_PRICE_ID", "").strip()
    if not price:
        raise HTTPException(status_code=503, detail="Set STRIPE_PRICE_ID to a recurring Price id.")

    base = os.getenv("PUBLIC_APP_URL", "http://localhost:3000").rstrip("/")

    customer_id = user.get("stripe_customer_id")
    if not customer_id:
        cust = stripe.Customer.create(email=user["email"], metadata={"kalshibot_user_id": str(uid)})
        customer_id = cust["id"]
        update_user_stripe_ids(uid, stripe_customer_id=customer_id)

    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": price, "quantity": 1}],
        success_url=f"{base}/dashboard?checkout=success",
        cancel_url=f"{base}/pricing?checkout=cancel",
        subscription_data={"metadata": {"kalshibot_user_id": str(uid)}},
        metadata={"kalshibot_user_id": str(uid)},
    )
    return {"url": session["url"]}


@router.post("/webhook")
async def stripe_webhook(request: Request) -> dict[str, str]:
    if not _stripe_enabled():
        raise HTTPException(status_code=503, detail="Stripe not configured")
    wh_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
    if not wh_secret:
        raise HTTPException(status_code=503, detail="STRIPE_WEBHOOK_SECRET not set")

    payload = await request.body()
    sig = request.headers.get("stripe-signature") or ""
    stripe.api_key = os.environ["STRIPE_SECRET_KEY"]

    try:
        event = stripe.Webhook.construct_event(payload=payload, sig_header=sig, secret=wh_secret)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid payload: {e}") from e
    except Exception as e:
        if "signature" in str(e).lower() or "SignatureVerification" in type(e).__name__:
            raise HTTPException(status_code=400, detail="Invalid Stripe signature") from e
        raise

    et = event["type"]
    obj = event["data"]["object"]

    if et == "customer.subscription.created" or et == "customer.subscription.updated":
        sub_id = obj.get("id")
        cust_id = obj.get("customer")
        status = str(obj.get("status") or "")
        uid = None
        meta = obj.get("metadata") or {}
        if meta.get("kalshibot_user_id"):
            try:
                uid = int(meta["kalshibot_user_id"])
            except (TypeError, ValueError):
                uid = None
        if uid is None and cust_id:
            from app.db import connect

            with connect() as con:
                row = con.execute(
                    "SELECT id FROM users WHERE stripe_customer_id = ?",
                    (cust_id,),
                ).fetchone()
                if row:
                    uid = int(row["id"])
        if uid is not None:
            update_user_stripe_ids(uid, stripe_subscription_id=sub_id)
            plan = "pro" if status in ("active", "trialing") else "free"
            update_user_plan(uid, plan=plan, subscription_status=status or "none")

    if et == "customer.subscription.deleted":
        sub_id = obj.get("id")
        cust_id = obj.get("customer")
        from app.db import connect

        with connect() as con:
            row = con.execute(
                "SELECT id FROM users WHERE stripe_subscription_id = ? OR stripe_customer_id = ?",
                (sub_id, cust_id),
            ).fetchone()
            if row:
                uid = int(row["id"])
                update_user_plan(uid, plan="free", subscription_status="canceled")

    return {"ok": "true"}
