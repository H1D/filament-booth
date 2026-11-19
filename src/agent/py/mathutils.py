"""The part of Blender's mathutils agents use: Vector, Euler and Color.

A value read from a struct is bound to it, as Blender's are, so
`obj.location.z += 0.1` writes the whole vector back through the owner as one
assignment. A value built here, or a copy, is bound to nothing. Pure Python,
no booth knowledge.
"""
import math


def _bound(value, owner, attr):
    """Binds a value read from `owner.attr`: changing one of its items assigns it back."""
    value._owner, value._attr = owner, attr
    return value


class _Items:
    __slots__ = ("_v", "_owner", "_attr")
    __hash__ = None

    def __init__(self, seq):
        self._v = [float(c) for c in seq]
        self._owner = None
        self._attr = None

    def _changed(self):
        if self._owner is not None:
            setattr(self._owner, self._attr, tuple(self._v))

    def __len__(self):
        return len(self._v)

    def __iter__(self):
        return iter(list(self._v))

    def __getitem__(self, i):
        v = self._v[i]
        return tuple(v) if isinstance(i, slice) else v

    def __setitem__(self, i, value):
        if isinstance(i, slice):
            items = [float(c) for c in value]
            if len(self._v[i]) != len(items):
                raise ValueError(f"{type(self).__name__}[a:b] = value: size mismatch")
            self._v[i] = items
        else:
            self._v[i] = float(value)
        self._changed()

    def __eq__(self, other):
        try:
            return len(self._v) == len(other) and all(a == b for a, b in zip(self._v, other))
        except TypeError:
            return NotImplemented

    def copy(self):
        return type(self)(self._v)

    __copy__ = copy

    def __deepcopy__(self, memo):
        return self.copy()

    def to_tuple(self, precision=-1):
        return tuple(self._v) if precision == -1 else tuple(round(c, precision) for c in self._v)

    def __repr__(self):
        return f"{type(self).__name__}(({', '.join(f'{c:.4f}' for c in self._v)}))"


def _item(i, name):
    def get(self):
        if i >= len(self._v):
            raise AttributeError(f"{type(self).__name__}.{name}: has no {name} axis")
        return self._v[i]

    def set(self, value):
        if i >= len(self._v):
            raise AttributeError(f"{type(self).__name__}.{name}: has no {name} axis")
        self._v[i] = float(value)
        self._changed()

    return property(get, set)


def _numbers(other, size):
    values = [float(c) for c in other]
    if len(values) != size:
        raise ValueError(f"expected {size} items, got {len(values)}")
    return values


class Vector(_Items):
    """x, y, z (and w), arithmetic, length, normalized(), dot(), cross(), lerp(), angle()."""

    __slots__ = ()
    x = _item(0, "x")
    y = _item(1, "y")
    z = _item(2, "z")
    w = _item(3, "w")

    def __init__(self, seq=(0.0, 0.0, 0.0)):
        super().__init__(seq)
        if not 2 <= len(self._v) <= 4:
            raise ValueError("Vector(): a vector has 2 to 4 items")

    def _zip(self, other, op):
        return Vector([op(a, b) for a, b in zip(self._v, _numbers(other, len(self._v)))])

    def __add__(self, other):
        return self._zip(other, lambda a, b: a + b)

    __radd__ = __add__

    def __sub__(self, other):
        return self._zip(other, lambda a, b: a - b)

    def __rsub__(self, other):
        return self._zip(other, lambda a, b: b - a)

    def __mul__(self, other):
        if isinstance(other, (int, float)):
            return Vector([a * other for a in self._v])
        return self._zip(other, lambda a, b: a * b)

    __rmul__ = __mul__

    def __truediv__(self, other):
        return Vector([a / other for a in self._v])

    def __matmul__(self, other):
        return self.dot(other)

    def __neg__(self):
        return Vector([-a for a in self._v])

    def __pos__(self):
        return self.copy()

    @property
    def length(self):
        return math.sqrt(self.length_squared)

    @property
    def length_squared(self):
        return sum(a * a for a in self._v)

    def dot(self, other):
        return sum(a * b for a, b in zip(self._v, _numbers(other, len(self._v))))

    def cross(self, other):
        a, (b0, b1, b2) = self._v, _numbers(other, 3)
        return Vector((a[1] * b2 - a[2] * b1, a[2] * b0 - a[0] * b2, a[0] * b1 - a[1] * b0))

    def normalized(self):
        n = self.length
        return Vector(self._v) if n == 0 else Vector([a / n for a in self._v])

    def normalize(self):
        self._v = self.normalized()._v
        self._changed()

    def lerp(self, other, factor):
        return self._zip(other, lambda a, b: a + (b - a) * factor)

    def angle(self, other, fallback=None):
        n = self.length * Vector(other).length
        if n == 0:
            if fallback is None:
                raise ValueError("Vector.angle(other): zero length vectors have no valid angle")
            return fallback
        return math.acos(max(-1.0, min(1.0, self.dot(other) / n)))

    def to_track_quat(self, track="-Z", up="Y"):
        raise AttributeError(
            "Vector.to_track_quat: the booth has no quaternions. The camera always looks at its target, "
            "so aim it with scene.camera.booth.target = point, or set rotation_euler directly")


class Euler(_Items):
    """x, y, z in radians, XYZ order."""

    __slots__ = ()
    x = _item(0, "x")
    y = _item(1, "y")
    z = _item(2, "z")

    def __init__(self, angles=(0.0, 0.0, 0.0), order="XYZ"):
        if order != "XYZ":
            raise ValueError("Euler(): the booth reads and writes rotations in XYZ order")
        super().__init__(angles)
        if len(self._v) != 3:
            raise ValueError("Euler(): an Euler has 3 angles")

    @property
    def order(self):
        return "XYZ"


class Color(_Items):
    """r, g, b, linear."""

    __slots__ = ()
    r = _item(0, "r")
    g = _item(1, "g")
    b = _item(2, "b")

    def __init__(self, rgb=(0.0, 0.0, 0.0)):
        super().__init__(rgb)
        if len(self._v) != 3:
            raise ValueError("Color(): a colour has 3 channels")

    def __add__(self, other):
        return Color([a + b for a, b in zip(self._v, _numbers(other, 3))])

    def __sub__(self, other):
        return Color([a - b for a, b in zip(self._v, _numbers(other, 3))])

    def __mul__(self, other):
        return Color([a * other for a in self._v])

    __rmul__ = __mul__
