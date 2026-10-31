package com.samuel.calculatrice;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.HorizontalScrollView;
import android.widget.TextView;

public class MainActivity extends Activity {

    private static final String OPERATORS = "+−×÷";

    private TextView expressionView;
    private TextView resultView;
    private HorizontalScrollView exprScroll;

    private final StringBuilder expr = new StringBuilder();
    private boolean justEvaluated = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        expressionView = findViewById(R.id.expression);
        resultView = findViewById(R.id.result);
        exprScroll = findViewById(R.id.exprScroll);

        // Appui long sur ⌫ = tout effacer
        findViewById(R.id.btnBack).setOnLongClickListener(v -> {
            clearAll();
            return true;
        });

        if (savedInstanceState != null) {
            expr.append(savedInstanceState.getString("expr", ""));
            justEvaluated = savedInstanceState.getBoolean("justEvaluated", false);
        }
        refresh();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString("expr", expr.toString());
        outState.putBoolean("justEvaluated", justEvaluated);
    }

    /** Appelé par tous les boutons (android:onClick dans le style). */
    public void onButtonClick(View view) {
        int id = view.getId();
        if (id == R.id.btnClear) {
            clearAll();
            return;
        }
        if (id == R.id.btnBack) {
            if (expr.length() > 0) expr.deleteCharAt(expr.length() - 1);
            justEvaluated = false;
            refresh();
            return;
        }
        if (id == R.id.btnEquals) {
            evaluate();
            return;
        }
        if (id == R.id.btnParen) {
            inputParenthesis();
            return;
        }

        String key = ((Button) view).getText().toString();
        char c = key.charAt(0);
        if (Character.isDigit(c)) {
            inputDigit(c);
        } else if (c == ',') {
            inputComma();
        } else if (c == '%') {
            inputPercent();
        } else if (OPERATORS.indexOf(c) >= 0) {
            inputOperator(c);
        }
    }

    private void inputDigit(char d) {
        if (justEvaluated) {
            expr.setLength(0);
            justEvaluated = false;
        }
        char last = lastChar();
        if (last == ')' || last == '%') {
            expr.append('×');
        }
        // Évite les zéros en tête du type "007"
        if (currentNumber().equals("0")) {
            expr.deleteCharAt(expr.length() - 1);
        }
        expr.append(d);
        refresh();
    }

    private void inputComma() {
        if (justEvaluated) {
            expr.setLength(0);
            justEvaluated = false;
        }
        if (currentNumber().contains(",")) return;
        char last = lastChar();
        if (last == ')' || last == '%') expr.append('×');
        if (!Character.isDigit(lastChar())) expr.append('0');
        expr.append(',');
        refresh();
    }

    private void inputOperator(char op) {
        justEvaluated = false;
        char last = lastChar();
        if (expr.length() == 0 || last == '(') {
            if (op == '−') {
                expr.append(op);
                refresh();
            }
            return;
        }
        if (OPERATORS.indexOf(last) >= 0) {
            // Remplace l'opérateur précédent (sauf un moins unaire en début / après "(")
            expr.deleteCharAt(expr.length() - 1);
            char before = lastChar();
            if (expr.length() == 0 || before == '(') {
                if (op == '−') expr.append(op);
                refresh();
                return;
            }
        }
        if (lastChar() == ',') expr.deleteCharAt(expr.length() - 1);
        expr.append(op);
        refresh();
    }

    private void inputPercent() {
        justEvaluated = false;
        char last = lastChar();
        if (Character.isDigit(last) || last == ')' || last == '%') {
            expr.append('%');
            refresh();
        }
    }

    private void inputParenthesis() {
        if (justEvaluated) justEvaluated = false;
        int open = 0;
        for (int i = 0; i < expr.length(); i++) {
            char ch = expr.charAt(i);
            if (ch == '(') open++;
            else if (ch == ')') open--;
        }
        char last = lastChar();
        boolean afterValue = Character.isDigit(last) || last == ')' || last == '%' || last == ',';
        if (open > 0 && afterValue) {
            expr.append(')');
        } else {
            if (afterValue) expr.append('×');
            expr.append('(');
        }
        refresh();
    }

    private void evaluate() {
        if (expr.length() == 0) return;
        String closed = autoClose(expr.toString());
        try {
            String res = Evaluator.format(Evaluator.evaluate(closed));
            expr.setLength(0);
            expr.append(res);
            justEvaluated = true;
            expressionView.setText(expr);
            resultView.setText("");
        } catch (ArithmeticException | NumberFormatException e) {
            String msg = e.getMessage();
            resultView.setText(msg != null && msg.startsWith("Division") ? "Division par zéro" : "Erreur");
        }
    }

    private void clearAll() {
        expr.setLength(0);
        justEvaluated = false;
        refresh();
    }

    /** Met à jour l'affichage et l'aperçu du résultat en direct. */
    private void refresh() {
        expressionView.setText(expr.length() == 0 ? "0" : expr);
        exprScroll.post(() -> exprScroll.fullScroll(View.FOCUS_RIGHT));

        String preview = "";
        String e = expr.toString();
        if (hasOperation(e)) {
            try {
                preview = "= " + Evaluator.format(Evaluator.evaluate(autoClose(e)));
            } catch (ArithmeticException | NumberFormatException ignored) {
                // expression incomplète : pas d'aperçu
            }
        }
        resultView.setText(preview);
    }

    private static boolean hasOperation(String e) {
        for (int i = 1; i < e.length(); i++) {
            char c = e.charAt(i);
            if (OPERATORS.indexOf(c) >= 0 || c == '%' || c == '(') return true;
        }
        return false;
    }

    /** Ajoute les parenthèses fermantes manquantes. */
    private static String autoClose(String e) {
        int open = 0;
        for (int i = 0; i < e.length(); i++) {
            char ch = e.charAt(i);
            if (ch == '(') open++;
            else if (ch == ')') open--;
        }
        StringBuilder sb = new StringBuilder(e);
        while (open-- > 0) sb.append(')');
        return sb.toString();
    }

    private char lastChar() {
        return expr.length() == 0 ? '\0' : expr.charAt(expr.length() - 1);
    }

    /** Le nombre en cours de saisie à la fin de l'expression. */
    private String currentNumber() {
        int i = expr.length();
        while (i > 0) {
            char ch = expr.charAt(i - 1);
            if (Character.isDigit(ch) || ch == ',') i--;
            else break;
        }
        return expr.substring(i);
    }
}
