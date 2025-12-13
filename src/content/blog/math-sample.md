---
title: '[Test] Math Support with LaTeX'
description: 'Testing LaTeX rendering in Astro using remark-math and rehype-katex'
pubDate: 'Jul 08 2022'
heroImage: '/blog-placeholder-1.jpg'
tags: ['math', 'latex', 'astro']
---

This post demonstrates **LaTeX** rendering support.

## Inline Math

You can write inline math equations like $E = mc^2$ or $e^{i\pi} + 1 = 0$.

## Block Math

For larger equations, use block math:

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

Maxwell's Equations:

$$
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \cdot \mathbf{B} &= 0 \\
\nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t} \\
\nabla \times \mathbf{B} &= \mu_0\mathbf{J} + \mu_0\varepsilon_0\frac{\partial \mathbf{E}}{\partial t}
\end{aligned}
$$

## Matrix

$$
\begin{pmatrix}
a & b \\
c & d
\end{pmatrix}^{-1} = \frac{1}{ad-bc} \begin{pmatrix}
d & -b \\
-c & a
\end{pmatrix}
$$
