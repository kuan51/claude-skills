"""Verification for the fixture service.

The monotonic-timestamp requirement has no test here on purpose: the fixture
exists to prove that trace_matrix.py fails on an untested requirement. Its ID is
not written out anywhere in this file, because naming it would itself count as
coverage.
"""
import pytest

from src.pressure import mean_gradient


def test_REQ_FIX_001_rejects_empty_snapshot():
    with pytest.raises(ValueError):
        mean_gradient([])


def test_REQ_FIX_003_rounds_to_one_decimal():
    samples = [{"t": 1, "p": 10.04}, {"t": 2, "p": 10.06}]
    assert mean_gradient(samples) == 10.1
