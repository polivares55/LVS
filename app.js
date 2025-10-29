window.addEventListener('DOMContentLoaded', () => {

    // --- 1. REFERENCIAS DEL DOM (Simplificado) ---
    const dom = {
        f_expr: document.getElementById('f_expr'),
        // g_expr: (Eliminado)
        x_min: document.getElementById('x_min'),
        x_max: document.getElementById('x_max'),
        isDiscrete: document.getElementById('signal_type_toggle'),
        x0_slider: document.getElementById('x0_slider'),
        x0_val: document.getElementById('x0_val'),
        a_slider: document.getElementById('a_slider'),
        a_val: document.getElementById('a_val'),
        symmetry_btn: document.getElementById('symmetry_btn'),
        // convolve_btn: (Eliminado)
        reset_plot_btn: document.getElementById('reset_plot_btn'),
        plotDiv: document.getElementById('plot'),
        errorMessage: document.getElementById('error_message'),
        // convSection: (Eliminado)
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
                if (typeof result === 'boolean') {
                    return result ? 1 : 0;
                }
                if (!isFinite(result)) {
                    return 0;
                }
                return result;
            } catch (e) {
                return 0; 
            }
        });
    }

    /**
     * Genera un array de puntos en el eje X (continuo o discreto)
     */
    function getXValues(min, max, isDiscrete) {
        if (isDiscrete) {
            min = Math.floor(min);
            max = Math.ceil(max);
            let n_values = [];
            for (let n = min; n <= max; n++) {
                n_values.push(n);
            }
            return n_values;
        } else {
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
     * Dibuja los "stems" (tallos) para el gráfico discreto
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

        dom.x0_val.textContent = x0.toFixed(1);
        dom.a_val.textContent = a.toFixed(2);
        
        if (isDiscrete) {
            a = snapDiscreteScale(a);
            dom.a_val.textContent = a.toFixed(2);
            dom.a_slider.value = a; 
        }

        let x_values = getXValues(min, max, isDiscrete);
        let transformed_x = x_values.map(x => a * (x - x0));
        let y_values = evaluateExpression(f_expr, transformed_x);
        
        if (!y_values) return; 

        if (isDiscrete && a !== 1) {
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
                        const original_index = base_n.indexOf(n_original);
                        if (original_index !== -1) {
                            y_values.push(base_f_n[original_index]);
                        } else {
                            y_values.push(0);
                        }
                        n_original++;
                    } else {
                        y_values.push(0); // Insertar cero
                    }
                }
            }
        }
        
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
            shapes: isDiscrete ? createStems(x_values, y_values) : []
        };

        Plotly.react(dom.plotDiv, [trace], layout);
    }

    /**
     * Ajusta el slider 'a' a valores didácticos (enteros o inversos)
     */
    function snapDiscreteScale(a) {
        const supported_scales = [0.2, 0.25, 0.33, 0.5, 1, 2, 3];
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
        
        const f_x = evaluateExpression(f_expr, x_values);
        const x_neg = x_values.map(x => -x);
        const f_neg_x = evaluateExpression(f_expr, x_neg);

        if (!f_x || !f_neg_x) return;

        const f_e = f_x.map((val, i) => 0.5 * (val + f_neg_x[i]));
        const f_o = f_x.map((val, i) => 0.5 * (val - f_neg_x[i]));

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
            shapes: []
        };

        Plotly.react(dom.plotDiv, [trace_orig, trace_even, trace_odd], layout);
    }

    /**
     * Función plotConvolution() ELIMINADA
     */
    // ...

    /**
     * Gestiona la visibilidad de los controles (Simplificado)
     */
    function toggleControls() {
        const isDiscrete = dom.isDiscrete.checked;
        // dom.convSection.style.display = (Eliminado)
        dom.discreteScaleInfo.style.display = isDiscrete ? 'block' : 'none';
        updatePlot(); // Actualizar gráfico al cambiar de modo
    }

    // --- 6. ASIGNACIÓN DE EVENTOS (LISTENERS) ---
    
    dom.x0_slider.addEventListener('input', updatePlot);
    dom.a_slider.addEventListener('input', updatePlot);
    
    dom.f_expr.addEventListener('change', updatePlot);
    dom.x_min.addEventListener('change', updatePlot);
    dom.x_max.addEventListener('change', updatePlot);
    dom.isDiscrete.addEventListener('change', toggleControls);
    
    // Botones
    dom.symmetry_btn.addEventListener('click', plotSymmetry);
    // dom.convolve_btn.addEventListener('click', plotConvolution); (Eliminado)
    dom.reset_plot_btn.addEventListener('click', updatePlot); 
    
    // --- 7. INICIO DE LA APP ---
    initializePlot();
    toggleControls(); 
});
