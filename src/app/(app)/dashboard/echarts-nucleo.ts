/**
 * ECharts con solo lo que usa el dashboard. Se importa con `import()` desde `echart.tsx`,
 * así queda en un trozo aparte y no pesa en el resto de la app.
 *
 * ⚠️ Al agregar un tipo de gráfica o una pieza nueva (una línea de referencia, un zoom…)
 * hay que registrarla aquí: si falta, ECharts no falla, simplemente no la dibuja.
 */
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart, TreemapChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  PolarComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import { LabelLayout, UniversalTransition } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  TreemapChart,
  GridComponent,
  PolarComponent, // el reloj de las canchas
  TooltipComponent,
  LegendComponent,
  TitleComponent, // la cifra del centro de la dona
  DataZoomComponent, // la barra para acercarse a unos días
  MarkLineComponent, // la línea de promedio
  MarkPointComponent, // el día más alto y la anotación del salto
  LabelLayout,
  UniversalTransition, // la transformación barras ↔ dona ↔ bloques
  CanvasRenderer,
]);

export { echarts };
