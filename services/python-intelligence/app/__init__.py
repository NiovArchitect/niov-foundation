"""NIOV Python intelligence runtime — FastAPI service exposing deterministic
ranking + forecasting endpoints consumed by the Foundation TS wrapper at
apps/api/src/services/intelligence/python-ranking.service.ts.

No external LLM calls. No provider keys. No raw memory. No chain-of-thought.
TypeScript is the sole policy / approval / DMW / audit authority — this
service only ranks closed-vocab signals.
"""
