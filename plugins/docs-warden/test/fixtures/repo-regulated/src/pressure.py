"""Synthetic fixture service. Computes a mean gradient from a snapshot."""


def mean_gradient(samples):
    """REQ-FIX-001: reject an empty snapshot.
    REQ-FIX-002: reject non-monotonic timestamps.
    REQ-FIX-003: round to one decimal place.
    """
    if not samples:
        raise ValueError("snapshot has no samples")
    times = [s["t"] for s in samples]
    if any(b <= a for a, b in zip(times, times[1:])):
        raise ValueError("snapshot timestamps are not monotonic")
    return round(sum(s["p"] for s in samples) / len(samples), 1)
