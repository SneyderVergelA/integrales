import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule, DecimalPipe, JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { create, all, MathJsStatic } from 'mathjs';
import * as Plotly from 'plotly.js-dist-min';

declare var MathJax: any;   // <-- NECESARIO

const math: MathJsStatic = create(all);

@Component({
  selector: 'app-calculadora',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DecimalPipe,
    JsonPipe
  ],
  templateUrl: './calculadora.html',
  styleUrls: ['./calculadora.css']
})
export class Calculadora implements OnInit {

  fxRaw = 'x^2 - 2x';
  gxRaw = '6x - x^2';

  fxExpr: string = '';
  gxExpr: string = '';

  xs: number[] = [-2, 0, 1, 2, 4];
  ysF: (number | null)[] = [];
  ysG: (number | null)[] = [];

  intersections: number[] = [];
  limitFrom?: number;
  limitTo?: number;
  alertNoIntersection = false;

  pasos: { title: string, content: string }[] = [];

  @ViewChild('plot') plotEl!: ElementRef<HTMLDivElement>;

  ngOnInit(): void {
    this.fxExpr = this.normalizeExpression(this.fxRaw);
    this.gxExpr = this.normalizeExpression(this.gxRaw);
    this.evalTables();
    this.findIntersectionsAndUpdate();
    this.plot();
    this.updateMathJax();
  }

  // 🔥 NUEVA FUNCIÓN – Render seguro de MathJax
  updateMathJax() {
    if (typeof MathJax !== 'undefined') {
      MathJax.typesetPromise();
    }
  }

  // ===============================
  // NORMALIZACIÓN
  // ===============================
  normalizeExpression(raw: string): string {
    let s = raw.replace(/\s+/g, '');

    s = s.replace(/(\d)(x)/gi, '$1*$2');
    s = s.replace(/(\d)\(/g, '$1*(');
    s = s.replace(/\)(x)/gi, ')*$1');
    s = s.replace(/\)\(/g, ')*(');

    s = s.replace(/(sin|cos|tan|log|sqrt|exp)\s*\(?([\-]?\d*\.?\d+|x)\)?/gi,
      (m, fn, arg) => arg === 'x' ? `${fn}(x)` : `${fn}(${arg})`
    );

    return s;
  }

  // ===============================
  // COMPILAR MATHJS
  // ===============================
  compileFunction(expr: string) {
    try {
      const node = math.parse(expr);
      const code = node.compile();
      return (xVal: number) => {
        const val = code.evaluate({ x: xVal });
        return typeof val === 'number' ? val : Number(val);
      };
    } catch (err) {
      return () => NaN;
    }
  }

  // ===============================
  // TABLAS
  // ===============================
  evalTables() {
    this.ysF = [];
    this.ysG = [];

    const f = this.compileFunction(this.fxExpr);
    const g = this.compileFunction(this.gxExpr);

    for (let xv of this.xs) {
      const y1 = f(xv);
      const y2 = g(xv);

      this.ysF.push(Number.isFinite(y1) ? +y1 : null);
      this.ysG.push(Number.isFinite(y2) ? +y2 : null);
    }
  }

  addColumn() {
    this.xs.push(0);
    this.evalTables();
    this.plot();
    this.updateMathJax();
  }

  onXsChange() {
    this.evalTables();
    this.plot();
    this.updateMathJax();
  }

  // ===============================
  // INTERSECCIONES
  // ===============================
  findIntersectionsAndUpdate() {
    this.fxExpr = this.normalizeExpression(this.fxRaw);
    this.gxExpr = this.normalizeExpression(this.gxRaw);

    const f = this.compileFunction(this.fxExpr);
    const g = this.compileFunction(this.gxExpr);
    const h = (x: number) => f(x) - g(x);

    const scanMin = -100, scanMax = 100;
    const steps = 2000;
    const dx = (scanMax - scanMin) / steps;

    const roots: number[] = [];
    let x0 = scanMin;
    let h0 = h(x0);

    for (let i = 1; i <= steps; i++) {
      const x1 = scanMin + i * dx;
      const h1 = h(x1);

      if (Number.isFinite(h0) && Number.isFinite(h1)) {
        if (h0 === 0) roots.push(x0);
        else if (h0 * h1 < 0) {
          let a = x0, b = x1;
          for (let k = 0; k < 60; k++) {
            const m = 0.5 * (a + b);
            const fm = h(m);
            if (Math.abs(fm) < 1e-12) { a = b = m; break; }
            if (h(a) * fm < 0) b = m; else a = m;
          }
          const r = 0.5 * (a + b);
          if (!roots.some(rr => Math.abs(rr - r) < 1e-6)) roots.push(r);
        }
      }

      x0 = x1; h0 = h1;
    }

    roots.sort((a, b) => a - b);
    this.intersections = roots;
    this.alertNoIntersection = roots.length === 0;

    if (!this.alertNoIntersection) {
      this.limitFrom = roots[0];
      this.limitTo = roots.length > 1 ? roots[1] : roots[0];
    } else {
      this.limitFrom = undefined;
      this.limitTo = undefined;
    }

    this.buildSteps(roots);
  }

  // ===============================
  // PASOS
  // ===============================
  buildSteps(roots: number[]) {
    this.pasos = [];

    this.pasos.push({
      title: '1) Igualar las funciones',
      content: `${this.fxExpr} = ${this.gxExpr}`
    });

    if (roots.length === 0) {
      this.pasos.push({
        title: '2) Resolver',
        content: 'No se encontraron puntos de intersección.'
      });
      return;
    }

    const rStr = roots.map(r => r.toFixed(6)).join(', ');
    this.pasos.push({
      title: '2) Resolver',
      content: `Raíces: x = ${rStr}`
    });
  }

  // ===============================
  // GRÁFICO
  // ===============================
  plot() {
    const xmin = Math.min(...this.xs, this.limitFrom ?? this.xs[0]) - 1;
    const xmax = Math.max(...this.xs, this.limitTo ?? this.xs[0]) + 1;

    const f = this.compileFunction(this.fxExpr);
    const g = this.compileFunction(this.gxExpr);

    const samples = 500;

    const xsPlot = Array.from({ length: samples }, (_, i) =>
      xmin + (i / (samples - 1)) * (xmax - xmin)
    );

    const ysF = xsPlot.map(x => f(x));
    const ysG = xsPlot.map(x => g(x));

    const data: any[] = [
      { x: xsPlot, y: ysF, mode: 'lines', name: 'f(x)' },
      { x: xsPlot, y: ysG, mode: 'lines', name: 'g(x)' }
    ];

    if (this.limitFrom !== undefined && this.limitTo !== undefined) {
      const a = this.limitFrom, b = this.limitTo;
      const mid = (a + b) / 2;

      const topIsF = f(mid) >= g(mid);

      const xsShade = Array.from({ length: 200 }, (_, i) =>
        a + (i / 199) * (b - a)
      );

      const top = xsShade.map(x => topIsF ? f(x) : g(x));
      const bot = xsShade.map(x => topIsF ? g(x) : f(x));

      data.push({
        x: xsShade.concat(xsShade.slice().reverse()),
        y: top.concat(bot.reverse()),
        fill: 'toself',
        fillcolor: 'rgba(0,100,200,0.2)',
        line: { width: 0 },
        showlegend: false
      });
    }

    Plotly.react(this.plotEl.nativeElement, data, {
      title: 'Gráfica de f(x) y g(x)',
      xaxis: { title: 'x' },
      yaxis: { title: 'y' },
    });

    this.updateMathJax();
  }

  // ===============================
  // CAMBIOS EN INPUTS
  // ===============================
  onFxChange() {
    this.fxExpr = this.normalizeExpression(this.fxRaw);
    this.evalTables();
    this.findIntersectionsAndUpdate();
    this.plot();
    this.updateMathJax();
  }

  onGxChange() {
    this.gxExpr = this.normalizeExpression(this.gxRaw);
    this.evalTables();
    this.findIntersectionsAndUpdate();
    this.plot();
    this.updateMathJax();
  }

  onLimitsChange() {
    if (this.limitFrom !== undefined && this.limitTo !== undefined) {
      if (this.limitFrom > this.limitTo) {
        [this.limitFrom, this.limitTo] = [this.limitTo, this.limitFrom];
      }
      this.plot();
      this.updateMathJax();
    }
  }

  // ===============================
  // INTEGRAL
  // ===============================
  integrateNumerical(a: number, b: number, fn: (x: number) => number, n = 1000) {
    if (a === b) return 0;
    if (n % 2 === 1) n++;

    const h = (b - a) / n;
    let s = fn(a) + fn(b);

    for (let i = 1; i < n; i++) {
      const x = a + i * h;
      s += (i % 2 === 0 ? 2 : 4) * fn(x);
    }
    return s * h / 3;
  }

  calcularArea() {
    if (this.limitFrom == null || this.limitTo == null)
      return { area: NaN, detalle: 'Sin límites' };

    const f = this.compileFunction(this.fxExpr);
    const g = this.compileFunction(this.gxExpr);

    const area = this.integrateNumerical(
      this.limitFrom,
      this.limitTo,
      x => Math.abs(f(x) - g(x)),
      2000
    );

    return { area, detalle: '' };
  }

  get areaResult() {
    return this.calcularArea();
  }

  // ===============================
  // LATEX
  // ===============================
  toLatex(expr: string): string {
    let s = expr.replace(/\s+/g, '');

    s = s.replace(/(\d+)\*x/g, '$1x');
    s = s.replace(/x\*(\d+)/g, '$1x');
    s = s.replace(/([a-zA-Z])\*([a-zA-Z])/g, '$1$2');
    s = s.replace(/([a-zA-Z])\^(\d+)/g, '$1^{ $2 }');
    s = s.replace(/([0-9])\^(\d+)/g, '$1^{ $2 }');

    return s;
  }

}
