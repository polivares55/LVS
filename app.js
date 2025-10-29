window.addEventListener('DOMContentLoaded', () => {

    // --- 1. REFERENCIAS DEL DOM ---
    const dom = {
        f_expr: document.getElementById('f_expr'),
        g_expr: document.getElementById('g_expr'),
        x_min: document.getElementById('x_min'),
        x_max: document.getElementById('x_max'),
        isDiscrete: document.getElementById('signal_type_toggle'),
        x0_slider: document.getElementById('x0_slider'),
        x0_val: document.getElementById('x0_val'),
        a_slider: document.getElementById('a_slider'),
        a_val: document.getElementById('a_val'),
        symmetry_btn: document.getElementById('symmetry_btn'),
        convolve_btn: document.getElementById('convolve_btn'),
        reset_plot_btn: document.getElementById('reset_plot_btn'),
        plotDiv: document.getElementById('plot'),
        errorMessage: document.getElementById('error_message'),
        convSection: document.getElementById('convolution_section'),
        discreteScaleInfo: document.getElementById('discrete_scale_info')
    };

    // Parser de math.js
    const parser = math.parser();

    // --- 2. INICIALIZACIÓN DE PLOTLY ---
    function initializePlot() {
        Plotly.newPlot(dom.plotDiv, [{
            x: [],
            y: [],
            mode: 'lines',
            name: 'y(x)'
        }], {
            title: 'y(x) = f(x)',
            xaxis: { title: 'x' },
            yaxis: { title: 'Amplitud' },
            margin: { l: 50, r: 30, b: 50, t: 50 }
        });
    }

    // --- 3. LÓGICA CENTRAL DE EVALUACIÓN ---

    /**
     * Compila y evalúa una expresión matemática en un rango de puntos.
     * Maneja expresiones booleanas (ej. x > 0) como 1 o 0.
     */
    function evaluateExpression(expr, x_values) {
        let compiledExpr;
        try {
            compiledExpr = math.compile(expr);
            dom.errorMessage.style.display = 'none';
        } catch (e) {
            dom.errorMessage.textContent = `Error en la expresión: ${e.message}`;
            dom.errorMessage.style.display = 'block';
            return null;
        }

        return x_values.map(x => {
            try {
                const result = compiledExpr.evaluate({ x });
                // Convertir booleanos a 1/0 para pulsos
                if (typeof result === 'boolean') {
                    return result ? 1 : 0;
                }
                // Manejar valores no finitos
                if (!isFinite(result)) {
                    return 0;
                }
                return result;
            } catch (e) {
                return 0; // Evaluar a 0 si hay error en un punto (ej. log(0))
            }
        });
    }

    /**
     * Genera un array de puntos en el eje X (continuo o discreto)
     */
    function getXValues(min, max, isDiscrete) {
        if (isDiscrete) {
            // Rango de enteros
            min = Math.floor(min);
            max = Math.ceil(max);
            let n_values = [];
            for (let n = min; n <= max; n++) {
                n_values.push(n);
            }
            return n_values;
        } else {
            // Rango continuo (alta resolución para Plotly)
            const num_points = 1000;
            const step = (max - min) / num_points;
            let x_values = [];
            for (let i = 0; i <= num_points; i++) {
                x_values.push(min + i * step);
            }
            return x_values;
        }
    }
    
    /**
     * Dibuja los "stems" (tallos) para el gráfico discreto usando 'shapes' de Plotly
     */
    function createStems(x, y) {
        return x.map((x_val, i) => ({
            type: 'line',
            x0: x_val,
            y0: 0,
            x1: x_val,
            y1: y[i],
            line: {
                color: 'grey',
                width: 1
            }
        }));
    }

    // --- 4. LÓGICA DE OPERACIONES (EL NÚCLEO) ---

    /**
     * Función principal que actualiza el gráfico
     */
    function updatePlot() {
        const f_expr = dom.f_expr.value;
        const min = parseFloat(dom.x_min.value);
        const max = parseFloat(dom.x_max.value);
        const isDiscrete = dom.isDiscrete.checked;
        const x0 = parseFloat(dom.x0_slider.value);
        let a = parseFloat(dom.a_slider.value);

        // Actualizar etiquetas de sliders
        dom.x0_val.textContent = x0.toFixed(1);
        dom.a_val.textContent = a.toFixed(2);
        
        // --- Lógica de Escalado Discreto (Requisito Pedagógico) ---
        if (isDiscrete) {
            // Ajustar (snap) el valor 'a' a los valores didácticos
            a = snapDiscreteScale(a);
            dom.a_val.textContent = a.toFixed(2);
            // Actualizar visualmente el slider (aunque el 'step' es 0.1, el valor se fuerza)
            dom.a_slider.value = a; 
        }

        // Generar los puntos del eje X
        let x_values = getXValues(min, max, isDiscrete);

        // Calcular los puntos de la función transformada: f(a * (x - x0))
        // 1. Crear el eje transformado
        let transformed_x = x_values.map(x => a * (x - x0));
        
        // 2. Evaluar f(x) en esos puntos
        let y_values = evaluateExpression(f_expr, transformed_x);
        
        if (!y_values) return; // Error de sintaxis, no continuar

        // --- Lógica Específica de Diezmado/Interpolación ---
        // Esto sobreescribe el cálculo simple si es discreto
        if (isDiscrete && a !== 1) {
            // Primero, obtenemos la señal base f[n]
            const base_n = getXValues(min, max, true);
            const base_f_n = evaluateExpression(f_expr, base_n);
            
            if (a > 1) { // Compresión (Diezmado)
                const factor = Math.round(a);
                y_values = base_f_n.filter((_, i) => base_n[i] % factor === 0);
                x_values = base_n.filter((_, i) => base_n[i] % factor === 0).map(n => n / factor);
                
            } else if (a < 1) { // Expansión (Interpolación por ceros)
                const factor = Math.round(1 / a);
                y_values = [];
                x_values = [];
                let n_original = 0;
                for (let n = min; n <= max; n++) {
                    x_values.push(n);
                    if (n % factor === 0) {
                        // Encontrar el índice correspondiente en f[n]
                        const original_index = base_n.indexOf(n_original);
                        if (original_index !== -1) {
                            y_values.push(base_f_n[original_index]);
                        } else {
                            y_values.push(0); // Fuera del rango original
                        }
                        n_original++;
                    } else {
                        y_values.push(0); // Insertar cero
                    }
                }
            }
        }
        
        // --- Actualización de Plotly ---
        const trace = {
            x: x_values,
            y: y_values,
            mode: isDiscrete ? 'markers' : 'lines',
            type: 'scatter',
            name: 'y(x)',
            marker: isDiscrete ? { size: 8, color: '#007bff' } : {},
            line: { color: '#007bff' }
        };

        const title = `y(${isDiscrete ? 'n' : 't'}) = f(${a.toFixed(2)} * (${isDiscrete ? 'n' : 't'} - ${x0.toFixed(1)}))`;
        
        const layout = {
            title: title,
            xaxis: { title: isDiscrete ? 'n' : 't', range: [min, max] },
            yaxis: { title: 'Amplitud' },
            shapes: isDiscrete ? createStems(x_values, y_values) : [] // Añadir stems
        };

        Plotly.react(dom.plotDiv, [trace], layout);
    }

    /**
     * Ajusta el slider 'a' a valores didácticos (enteros o inversos)
     */
    function snapDiscreteScale(a) {
        const supported_scales = [0.2, 0.25, 0.33, 0.5, 1, 2, 3];
        // Encontrar el valor soportado más cercano
        return supported_scales.reduce((prev, curr) => 
            (Math.abs(curr - a) < Math.abs(prev - a) ? curr : prev)
        );
    }

    // --- 5. LÓGICAS DE BOTONES ---

    /**
     * Descomposición en Par / Impar
     */
    function plotSymmetry() {
        const f_expr = dom.f_expr.value;
        const min = parseFloat(dom.x_min.value);
        const max = parseFloat(dom.x_max.value);
        const isDiscrete = dom.isDiscrete.checked;
        const x_values = getXValues(min, max, isDiscrete);
        
        // 1. f(x)
        const f_x = evaluateExpression(f_expr, x_values);
        // 2. f(-x)
        const x_neg = x_values.map(x => -x);
        const f_neg_x = evaluateExpression(f_expr, x_neg);

        if (!f_x || !f_neg_x) return; // Error

        // 3. Componente Par: 0.5 * (f(x) + f(-x))
        const f_e = f_x.map((val, i) => 0.5 * (val + f_neg_x[i]));
        // 4. Componente Impar: 0.5 * (f(x) - f(-x))
        const f_o = f_x.map((val, i) => 0.5 * (val - f_neg_x[i]));

        // --- Actualizar Plotly con 3 trazas ---
        const trace_orig = {
            x: x_values, y: f_x, mode: 'lines', name: 'f(x)', line: { dash: 'dot', color: 'grey' }
        };
        const trace_even = {
            x: x_values, y: f_e, mode: 'lines', name: 'Componente Par (f_e)', line: { color: 'red' }
        };
        const trace_odd = {
            x: x_values, y: f_o, mode: 'lines', name: 'Componente Impar (f_o)', line: { color: 'blue' }
        };
        
        if(isDiscrete) {
            [trace_orig, trace_even, trace_odd].forEach(t => {
                t.mode = 'markers';
                t.marker = { size: 6 };
            });
        }

        const layout = {
            title: 'Descomposición Par / Impar',
            xaxis: { title: isDiscrete ? 'n' : 't', range: [min, max] },
            yaxis: { title: 'Amplitud' },
            shapes: [] // No dibujar stems en simetría para claridad
        };

        Plotly.react(dom.plotDiv, [trace_orig, trace_even, trace_odd], layout);
    }

    /**
     * Convolución Discreta (Numérica)
     */
    function plotConvolution() {
        if (!dom.isDiscrete.checked) {
            dom.errorMessage.textContent = 'La convolución solo está implementada para señales discretas.';
            dom.errorMessage.style.display = 'block';
            return;
        }

        const min = Math.floor(parseFloat(dom.x_min.value));
        const max = Math.ceil(parseFloat(dom.x_max.value));
        
        // 1. Muestrear f[n]
        const n_base = getXValues(min, max, true);
        const f_n = evaluateExpression(dom.f_expr.value, n_base);
        // 2. Muestrear g[n]
        const g_n = evaluateExpression(dom.g_expr.value, n_base);

        if (!f_n || !g_n) return;

        // 3. Calcular Convolución: y[n] = f[n] * g[n]
        const y_n = [];
        const n_conv_min = 2 * min;
        const n_conv_max = 2 * max;
        const n_conv = [];

        // Implementación del sumatorio de convolución
        for (let n = n_conv_min; n <= n_conv_max; n++) {
            let sum = 0;
            for (let k = min; k <= max; k++) {
                const f_k_val = f_n[n_base.indexOf(k)] || 0;
                const g_n_k_val = g_n[n_base.indexOf(n - k)] || 0;
                sum += f_k_val * g_n_k_val;
            }
            y_n.push(sum);
            n_conv.push(n);
        }

        // 4. Graficar y[n]
        const trace = {
            x: n_conv,
            y: y_n,
            mode: 'markers',
            type: 'scatter',
            name: 'y[n] = f[n] * g[n]',
            marker: { size: 8, color: '#28a745' }
        };

        const layout = {
            title: 'Convolución Discreta',
            xaxis: { title: 'n', range: [n_conv_min, n_conv_max] },
            yaxis: { title: 'Amplitud' },
            shapes: createStems(n_conv, y_n)
        };
        
        Plotly.react(dom.plotDiv, [trace], layout);
    }

    /**
     * Gestiona la visibilidad de los controles
     */
    function toggleControls() {
        const isDiscrete = dom.isDiscrete.checked;
        dom.convSection.style.display = isDiscrete ? 'block' : 'none';
        dom.discreteScaleInfo.style.display = isDiscrete ? 'block' : 'none';
        updatePlot(); // Actualizar gráfico al cambiar de modo
    }

    // --- 6. ASIGNACIÓN DE EVENTOS (LISTENERS) ---
    
    // Eventos 'input' para actualización en tiempo real
    dom.x0_slider.addEventListener('input', updatePlot);
    dom.a_slider.addEventListener('input', updatePlot);
    
    // Eventos 'change' para recalcular al soltar o cambiar
    dom.f_expr.addEventListener('change', updatePlot);
    dom.x_min.addEventListener('change', updatePlot);
    dom.x_max.addEventListener('change', updatePlot);
    dom.isDiscrete.addEventListener('change', toggleControls);
    
    // Botones
    dom.symmetry_btn.addEventListener('click', plotSymmetry);
    dom.convolve_btn.addEventListener('click', plotConvolution);
    dom.reset_plot_btn.addEventListener('click', updatePlot); // 'Reset' simplemente vuelve a f(x)
    
    // --- 7. INICIO DE LA APP ---
    initializePlot();
    toggleControls(); // Llama a updatePlot() internamente
});
