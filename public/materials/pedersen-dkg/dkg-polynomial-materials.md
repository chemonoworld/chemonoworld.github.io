# DKG Polynomial Materials

In DKG, each participant `i` samples its own degree `t` polynomial:

```math
f_i(x) = \sum_{j=0}^{t} c_{i,j} x^j
```

The constant term is the participant's local secret contribution:

```math
c_{i,0} = sk_i = f_i(0)
```

For three participants:

```math
f_1(x) = \sum_{j=0}^{t} c_{1,j} x^j
```

```math
f_2(x) = \sum_{j=0}^{t} c_{2,j} x^j
```

```math
f_3(x) = \sum_{j=0}^{t} c_{3,j} x^j
```

SVG files:

- [Participant 1 polynomial](./dkg-f-1.svg)
- [Participant 2 polynomial](./dkg-f-2.svg)
- [Participant 3 polynomial](./dkg-f-3.svg)
