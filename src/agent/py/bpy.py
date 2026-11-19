"""The booth's bpy: Blender's Python API over the booth tab.

Generic on purpose. It knows Blender's shapes (structs, collections,
operators, context) and nothing about the booth: every type, attribute, unit,
limit and operator comes from src/agent/rna.ts through `booth_host`, the JS
module the worker registers. A new attribute is a row in rna.ts, never an edit
here.

A struct is a handle and a type name, so `light = bpy.data.objects["Key"]`
holds the light's id, not a copy of it. Every read asks the booth and every
assignment is one edit to it.
"""
import json as _json
import sys as _sys
import warnings as _warnings

import booth_host as _host
import mathutils as _mathutils

_SHIM_DIR = __file__.rsplit("/", 1)[0] + "/"

_ERRORS = {
    "AttributeError": AttributeError, "ValueError": ValueError, "TypeError": TypeError, "KeyError": KeyError,
    "IndexError": IndexError, "RuntimeError": RuntimeError, "ReferenceError": ReferenceError,
}


def _call(*request):
    text = _json.dumps(request, allow_nan=False)
    try:
        reply = _host.call(text)
    except Exception as e:
        raise RuntimeError(f"the booth tab did not answer: {e}") from None
    reply = _json.loads(reply)
    if "error" in reply:
        raise _ERRORS.get(reply["error"]["type"], RuntimeError)(reply["error"]["message"])
    return reply["ok"]


def _plain(value):
    """What an assignment sends: plain JSON, with a struct as its handle."""
    if isinstance(value, bpy_struct):
        return {"$struct": value._handle}
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    try:
        return [_plain(v) for v in value]
    except TypeError:
        raise TypeError(f"a {type(value).__name__} cannot be sent to the booth") from None


def _value(v, owner, attr):
    """A read's answer as Python: a struct, a collection, a bound mathutils value or array, or a plain value."""
    if "struct" in v:
        return _CLASSES[v["type"]](v["struct"])
    if "coll" in v:
        return bpy_prop_collection(v["coll"])
    value, wrap = v["v"], v["wrap"]
    if value is None:
        return None
    if wrap == "float":
        return float(value)
    if wrap == "array":
        return bpy_prop_array(value, owner, attr)
    if wrap is not None:
        return _mathutils._bound(getattr(_mathutils, wrap)(value), owner, attr)
    return tuple(value) if isinstance(value, list) else value


class bpy_struct:
    """Every booth struct. Attribute access goes to the booth through rna.ts."""

    __slots__ = ("_handle",)
    _rna = None

    def __init__(self, handle):
        object.__setattr__(self, "_handle", handle)

    def __getattr__(self, name):
        if name.startswith("__") and name.endswith("__"):
            raise AttributeError(name)
        return _value(_call("get", self._handle, self._rna, name), self, name)

    def __setattr__(self, name, value):
        warning = _call("set", self._handle, self._rna, name, _plain(value))["warning"]
        if warning:
            # A write through a Vector or Color arrives from mathutils, so the warning names the first frame outside the shim.
            caller = _sys._getframe(1)
            while caller.f_back is not None and caller.f_code.co_filename.startswith(_SHIM_DIR):
                caller = caller.f_back
            # Without a registry Python cannot mark the line as already warned, so each assignment the booth altered says so.
            _warnings.warn_explicit(warning, UserWarning, caller.f_code.co_filename, caller.f_lineno)

    def __dir__(self):
        return sorted(_TYPES[self._rna]["attrs"])

    def __eq__(self, other):
        return isinstance(other, bpy_struct) and (self._handle, self._rna) == (other._handle, other._rna)

    def __hash__(self):
        return hash((self._handle, self._rna))

    def __repr__(self):
        return _call("repr", self._handle, self._rna)


class bpy_prop_collection:
    """bpy.data.objects and the like: by name or index, iteration, len, get, keys, values, items, find, remove."""

    __slots__ = ("_name",)

    def __init__(self, name):
        self._name = name

    def _members(self):
        return _call("members", self._name)

    @staticmethod
    def _struct(member):
        return _CLASSES[member["type"]](member["struct"])

    def __getitem__(self, key):
        members = self._members()
        if isinstance(key, slice):
            return [self._struct(m) for m in members[key]]
        if isinstance(key, int):
            if not -len(members) <= key < len(members):
                raise IndexError(f"bpy_prop_collection[index]: index {key} out of range, size {len(members)}")
            return self._struct(members[key])
        if isinstance(key, str):
            for m in members:
                if m["name"] == key:
                    return self._struct(m)
            raise KeyError(f'bpy_prop_collection[key]: key "{key}" not found')
        raise TypeError(f"bpy_prop_collection[key]: invalid key, must be a string or an int, not {type(key).__name__}")

    def __iter__(self):
        return iter([self._struct(m) for m in self._members()])

    def __len__(self):
        return len(self._members())

    def __contains__(self, key):
        if isinstance(key, bpy_struct):
            return any(m["struct"] == key._handle for m in self._members())
        return any(m["name"] == key for m in self._members())

    def get(self, key, default=None):
        try:
            return self[key]
        except (KeyError, IndexError):
            return default

    def keys(self):
        return [m["name"] for m in self._members()]

    def values(self):
        return list(self)

    def items(self):
        return [(m["name"], self._struct(m)) for m in self._members()]

    def find(self, key):
        names = self.keys()
        return names.index(key) if key in names else -1

    def remove(self, item, do_unlink=True, do_id_user=True, do_ui_user=True):
        if not isinstance(item, bpy_struct):
            raise TypeError(f"{self._name}.remove(item): expected a struct, not {type(item).__name__}")
        _call("remove", self._name, item._handle)

    def new(self, *args, **kwargs):
        return _call("create", self._name)

    def __repr__(self):
        return f"<bpy_collection[{len(self)}], {self._name}>"


class bpy_prop_array:
    """A float array attribute, such as a socket's RGBA. Setting an item assigns the whole array back."""

    __slots__ = ("_v", "_owner", "_attr")
    __hash__ = None

    def __init__(self, values, owner, attr):
        self._v, self._owner, self._attr = [float(v) for v in values], owner, attr

    def __len__(self):
        return len(self._v)

    def __iter__(self):
        return iter(list(self._v))

    def __getitem__(self, i):
        v = self._v[i]
        return tuple(v) if isinstance(i, slice) else v

    def __setitem__(self, i, value):
        items = list(self._v)
        items[i] = value
        if len(items) != len(self._v):
            raise ValueError("bpy_prop_array[a:b] = value: size mismatch")
        setattr(self._owner, self._attr, tuple(items))
        self._v = items

    def __eq__(self, other):
        try:
            return tuple(self._v) == tuple(other)
        except TypeError:
            return NotImplemented

    def __repr__(self):
        return f"<bpy_float[{len(self._v)}], {self._attr}: {tuple(self._v)}>"


class _Operator:
    __slots__ = ("_name",)

    def __init__(self, name):
        self._name = name

    def __call__(self, *args, **kwargs):
        # Blender takes an execution context ('EXEC_DEFAULT') and an undo flag positionally; neither means anything here.
        for arg in args:
            if not isinstance(arg, (str, bool)):
                raise TypeError(f"bpy.ops.{self._name}: positional arguments are an execution context or undo flag, not {type(arg).__name__}")
        return set(_call("op", self._name, {k: _plain(v) for k, v in kwargs.items()}))

    def poll(self, *args):
        return True

    def __repr__(self):
        return f"bpy.ops.{self._name}()"


class _OperatorModule:
    __slots__ = ("_module",)

    def __init__(self, module):
        self._module = module

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        return _Operator(f"{self._module}.{name}")


class _Operators:
    """bpy.ops: an operator that does not exist fails when it is called, with the booth's way instead."""

    def __getattr__(self, module):
        if module.startswith("__"):
            raise AttributeError(module)
        return _OperatorModule(module)


class _Types:
    """bpy.types: one class per Blender class the booth offers."""


class _App:
    """bpy.app."""

    def __init__(self, version):
        self.version = tuple(version)
        self.version_string = ".".join(str(v) for v in version) + " (Filament booth)"
        self.background = False
        self.binary_path = ""


class _Booth:
    """What the booth adds to bpy."""

    @staticmethod
    def reference(only=None):
        """Every type, attribute and operator the booth offers, with units and limits. `only` names one type or operator."""
        return _call("reference", only)


_BOOT = _call("boot")
_TYPES = _BOOT["types"]
_CLASSES = {}
types = _Types()
for _name, _type in _TYPES.items():
    _base = getattr(types, _type["pyClass"], None)
    if _base is None:
        _base = type(_type["pyClass"], (bpy_struct,), {"__slots__": ()})
        setattr(types, _type["pyClass"], _base)
    _CLASSES[_name] = type(_type["pyClass"], (_base,), {"__slots__": (), "__doc__": _type["doc"], "_rna": _name})

data = _CLASSES[_BOOT["data"]["type"]](_BOOT["data"]["struct"])
context = _CLASSES[_BOOT["context"]["type"]](_BOOT["context"]["struct"])
ops = _Operators()
app = _App(_BOOT["version"])
booth = _Booth()
