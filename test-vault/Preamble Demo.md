# Preamble demo (MathJax Plus)

These use macros defined in `preamble.sty` (reloaded automatically on edits). If
the plugin is working, they expand; otherwise they'd show as red undefined names.

- `\bs` (boldsymbol): $\bs k + \bs v$
- `\Ep` (custom): $\Ep{\omega t}$
- `\QHO` (custom, uses `\dagger` + bold): $$\QHO{a} = \sum_{\mathbf k}\omega_{\mathbf k} a_{\mathbf k}^\dagger a_{\mathbf k}$$
- `\Re` (renewed via `\operatorname`): $\Re(z)$
- `\dd` (from `\require{physics}`): $\int_0^\infty f(x)\,\dd x$

Plain math still works too: $e^{i\pi}+1=0$.
