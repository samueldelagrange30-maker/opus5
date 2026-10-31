package com.samuel.calculatrice;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;

/**
 * Évalue une expression arithmétique saisie dans la calculatrice.
 * Opérateurs : + − × ÷, % (pourcentage postfixé), parenthèses,
 * virgule décimale et moins unaire. Multiplication implicite : 2(3) = 6.
 */
public final class Evaluator {

    private static final MathContext MC = new MathContext(20, RoundingMode.HALF_EVEN);

    private final String s;
    private int pos;

    private Evaluator(String s) {
        this.s = s;
    }

    /** Évalue l'expression ; lève ArithmeticException si elle est invalide. */
    public static BigDecimal evaluate(String expression) {
        Evaluator e = new Evaluator(expression.replace(" ", ""));
        BigDecimal v = e.parseExpression();
        if (e.pos != e.s.length()) {
            throw new ArithmeticException("Syntaxe");
        }
        return v;
    }

    /** Formate un résultat à la française (virgule décimale, 12 chiffres significatifs max). */
    public static String format(BigDecimal v) {
        BigDecimal r = v.round(new MathContext(12, RoundingMode.HALF_EVEN));
        if (r.signum() == 0) {
            return "0";
        }
        r = r.stripTrailingZeros();
        String str;
        if (r.abs().compareTo(new BigDecimal("1e12")) >= 0
                || r.abs().compareTo(new BigDecimal("1e-9")) < 0) {
            str = r.toString().replace("E+", "E");
        } else {
            str = r.toPlainString();
        }
        return str.replace('.', ',').replace('-', '−');
    }

    private BigDecimal parseExpression() {
        BigDecimal v = parseTerm();
        while (pos < s.length()) {
            char c = s.charAt(pos);
            if (c == '+') {
                pos++;
                v = v.add(parseTerm(), MC);
            } else if (c == '−' || c == '-') {
                pos++;
                v = v.subtract(parseTerm(), MC);
            } else {
                break;
            }
        }
        return v;
    }

    private BigDecimal parseTerm() {
        BigDecimal v = parseUnary();
        while (pos < s.length()) {
            char c = s.charAt(pos);
            if (c == '×' || c == '*') {
                pos++;
                v = v.multiply(parseUnary(), MC);
            } else if (c == '÷' || c == '/') {
                pos++;
                BigDecimal d = parseUnary();
                if (d.signum() == 0) {
                    throw new ArithmeticException("Division par zéro");
                }
                v = v.divide(d, MC);
            } else if (c == '(' || Character.isDigit(c) || c == ',' || c == '.') {
                // multiplication implicite : 2(3), (2)(3), (2)3
                v = v.multiply(parseUnary(), MC);
            } else {
                break;
            }
        }
        return v;
    }

    private BigDecimal parseUnary() {
        if (pos < s.length()) {
            char c = s.charAt(pos);
            if (c == '−' || c == '-') {
                pos++;
                return parseUnary().negate();
            }
            if (c == '+') {
                pos++;
                return parseUnary();
            }
        }
        return parsePostfix();
    }

    private BigDecimal parsePostfix() {
        BigDecimal v = parsePrimary();
        while (pos < s.length() && s.charAt(pos) == '%') {
            pos++;
            v = v.divide(BigDecimal.valueOf(100), MC);
        }
        return v;
    }

    private BigDecimal parsePrimary() {
        if (pos >= s.length()) {
            throw new ArithmeticException("Incomplet");
        }
        char c = s.charAt(pos);
        if (c == '(') {
            pos++;
            BigDecimal v = parseExpression();
            if (pos >= s.length() || s.charAt(pos) != ')') {
                throw new ArithmeticException("Parenthèse");
            }
            pos++;
            return v;
        }
        int start = pos;
        boolean sep = false;
        while (pos < s.length()) {
            char d = s.charAt(pos);
            if (Character.isDigit(d)) {
                pos++;
            } else if ((d == ',' || d == '.') && !sep) {
                sep = true;
                pos++;
            } else {
                break;
            }
        }
        // Notation scientifique issue d'un résultat précédent, ex. 9,99E13 ou 1E−10
        if (pos < s.length() && s.charAt(pos) == 'E') {
            int p = pos + 1;
            if (p < s.length() && (s.charAt(p) == '−' || s.charAt(p) == '-')) p++;
            int digits = p;
            while (p < s.length() && Character.isDigit(s.charAt(p))) p++;
            if (p > digits) pos = p;
        }
        String num = s.substring(start, pos).replace(',', '.').replace('−', '-');
        if (num.isEmpty() || num.equals(".")) {
            throw new ArithmeticException("Syntaxe");
        }
        if (num.startsWith(".")) num = "0" + num;
        if (num.endsWith(".")) num = num + "0";
        return new BigDecimal(num);
    }
}
