"""Unit tests for the call-site rules check_fault_tolerance.py runs per module."""
import ast

import check_fault_tolerance as cft


def _kinds(src: str) -> list[str]:
    return [k for _, _, k in cft._scan_tree(ast.parse(src), "m.py")]


def test_int_in_try_catching_valueerror_only_is_flagged():
    src = "try:\n    n = int(v)\nexcept (TypeError, ValueError):\n    n = 0\n"
    assert _kinds(src) == ["int-overflow"]


def test_int_in_try_catching_valueerror_alone_is_clean():
    src = "try:\n    n = int(v)\nexcept ValueError:\n    n = 0\n"
    assert _kinds(src) == []


def test_int_in_try_with_separate_value_and_type_handlers_is_flagged():
    src = "try:\n    n = int(v)\nexcept ValueError:\n    n = 0\nexcept TypeError:\n    n = 1\n"
    assert _kinds(src) == ["int-overflow"]


def test_int_in_try_catching_exception_is_clean():
    src = "try:\n    n = int(v)\nexcept Exception:\n    raise\n"
    assert _kinds(src) == []


def test_int_in_try_catching_overflow_is_clean():
    src = "try:\n    n = int(v)\nexcept (TypeError, ValueError, OverflowError):\n    n = 0\n"
    assert _kinds(src) == []


def test_int_in_try_with_separate_arithmetic_handler_is_clean():
    src = "try:\n    n = int(v)\nexcept (TypeError, ValueError):\n    n = 0\nexcept ArithmeticError:\n    n = 1\n"
    assert _kinds(src) == []


def test_int_in_try_without_valueerror_handler_is_clean():
    src = "try:\n    n = int(v)\nexcept KeyError:\n    n = 0\n"
    assert _kinds(src) == []


def test_int_inside_nested_function_in_try_is_clean():
    src = "try:\n    def f():\n        return int(v)\nexcept (TypeError, ValueError):\n    pass\n"
    assert "int-overflow" not in _kinds(src)


def test_int_outside_try_is_clean():
    assert _kinds("n = int(v)\n") == []


def test_only_innermost_try_counts():
    src = (
        "try:\n"
        "    try:\n"
        "        n = int(v)\n"
        "    except KeyError:\n"
        "        n = 0\n"
        "except (TypeError, ValueError):\n"
        "    n = 1\n"
    )
    assert _kinds(src) == []


def test_int_in_handler_body_is_not_guarded_by_that_try():
    src = "try:\n    f()\nexcept (TypeError, ValueError):\n    n = int(v)\n"
    assert _kinds(src) == []


def test_flagged_call_keys_at_its_own_line():
    src = "try:\n    f()\n    n = int(v)\nexcept (TypeError, ValueError):\n    n = 0\n"
    assert cft._scan_tree(ast.parse(src), "m.py") == [("m.py", 3, "int-overflow")]
