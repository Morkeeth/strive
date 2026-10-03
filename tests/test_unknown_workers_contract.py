import pytest
from agentgrinder.contract import validate_run

def test_absent_workers_remain_unknown():
    run={'harness':'Grok Bot','ridge':[1]*50,'ridge_basis':'turn-order','trace_basis':'timestamps unavailable'}
    validate_run(run)
    assert 'worker_bins' not in run

@pytest.mark.parametrize('workers',[[],[-1]*50,[False]*50,'unknown',[0]*49])
def test_malformed_supplied_workers_are_not_silently_replaced(workers):
    with pytest.raises(ValueError):
        validate_run({'ridge':[1]*50,'ridge_basis':'turn-order','worker_bins':workers})
