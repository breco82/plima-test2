/* Generated from Java with JSweet 2.2.0-SNAPSHOT - http://www.jsweet.org */
/**
 * <p>Title: Class for float-point calculations in J2ME applications CLDC 1.1</p>
 * <p>Description: Useful methods for float-point calculations which absent in native Math class</p>
 * <p>Copyright: Copyright (c) 2004 Nick Henson</p>
 * <p>Company: UNTEH</p>
 * <p>License: Free use only for non-commercial purpose</p>
 * <p>If you want to use all or part of this class for commercial applications then take into account these conditions:</p>
 * <p>1. I need a one copy of your product which includes my class with license key and so on</p>
 * <p>2. Please append my copyright information henson.midp.Float (C) by Nikolay Klimchuk on ï¿½ï¿½ï¿½Aboutï¿½ï¿½ï¿½ screen of your product</p>
 * <p>3. If you have web site please append link <a href=ï¿½ï¿½ï¿½http://henson.newmail.ruï¿½ï¿½ï¿½>Nikolay Klimchuk</a> on the page with description of your product</p>
 * <p>That's all, thank you!</p>
 * @author Nikolay Klimchuk http://henson.newmail.ru
 * @version 0.5
 * @class
 */
var Float11 = (function () {
    function Float11() {
    }
    Float11.acos = function (x) {
        var f = Float11.asin(x);
        if (f === NaN)
            return f;
        return Math.PI / 2 - f;
    };
    Float11.asin = function (x) {
        if (x < -1.0 || x > 1.0)
            return NaN;
        if (x === -1.0)
            return -Math.PI / 2;
        if (x === 1)
            return Math.PI / 2;
        return Float11.atan(x / Math.sqrt(1 - x * x));
    };
    Float11.atan = function (x) {
        var signChange = false;
        var Invert = false;
        var sp = 0;
        var x2;
        var a;
        if (x < 0.0) {
            x = -x;
            signChange = true;
        }
        if (x > 1.0) {
            x = 1 / x;
            Invert = true;
        }
        while ((x > Math.PI / 12)) {
            {
                sp++;
                a = x + Float11.SQRT3;
                a = 1 / a;
                x = x * Float11.SQRT3;
                x = x - 1;
                x = x * a;
            }
        }
        ;
        x2 = x * x;
        a = x2 + 1.4087812;
        a = 0.55913709 / a;
        a = a + 0.60310579;
        a = a - (x2 * 0.05160454);
        a = a * x;
        while ((sp > 0)) {
            {
                a = a + Math.PI / 6;
                sp--;
            }
        }
        ;
        if (Invert)
            a = Math.PI / 2 - a;
        if (signChange)
            a = -a;
        return a;
    };
    Float11.atan2 = function (y, x) {
        if (y === 0.0 && x === 0.0)
            return 0.0;
        if (x > 0.0)
            return Float11.atan(y / x);
        if (x < 0.0) {
            if (y < 0.0)
                return -(Math.PI - Float11.atan(y / x));
            else
                return Math.PI - Float11.atan(-y / x);
        }
        if (y < 0.0)
            return -Math.PI / 2.0;
        else
            return Math.PI / 2.0;
    };
    Float11.exp = function (x) {
        if (x === 0.0)
            return 1.0;
        var f = 1;
        var d = 1;
        var k;
        var isless = (x < 0.0);
        if (isless)
            x = -x;
        k = x / d;
        for (var i = 2; i < 50; i++) {
            {
                f = f + k;
                k = k * x / i;
            }
            ;
        }
        if (isless)
            return 1 / f;
        else
            return f;
    };
    /*private*/ Float11._log = function (x) {
        if (!(x > 0.0))
            return NaN;
        var f = 0.0;
        var appendix = 0;
        while ((x > 0.0 && x <= 1.0)) {
            {
                x *= 2.0;
                appendix++;
            }
        }
        ;
        x /= 2.0;
        appendix--;
        var y1 = x - 1.0;
        var y2 = x + 1.0;
        var y = y1 / y2;
        var k = y;
        y2 = k * y;
        for (var i = 1; i < 50; i += 2) {
            {
                f += k / i;
                k *= y2;
            }
            ;
        }
        f *= 2.0;
        for (var i = 0; i < appendix; i++) {
            f += Float11.LOGdiv2;
        }
        return f;
    };
    Float11.log = function (x) {
        if (!(x > 0.0))
            return NaN;
        if (x === 1.0)
            return 0.0;
        if (x > 1.0) {
            x = 1 / x;
            return -Float11._log(x);
        }
        return Float11._log(x);
    };
    Float11.log10 = function (x) {
        return Float11.log(x) / Float11.LOG10;
    };
    Float11.pow = function (x, y) {
        if (x === 0.0)
            return 0.0;
        if (x === 1.0)
            return 1.0;
        if (y === 0.0)
            return 1.0;
        if (y === 1.0)
            return x;
        var l = (function (n) { return n < 0 ? Math.ceil(n) : Math.floor(n); })(Math.floor(y));
        var integerValue = (y === l);
        if (integerValue) {
            var neg = false;
            if (y < 0.0)
                neg = true;
            var result = x;
            for (var i = 1; i < (neg ? -l : l); i++) {
                result = result * x;
            }
            if (neg)
                return 1.0 / result;
            else
                return result;
        }
        else {
            if (x > 0.0)
                return Float11.exp(y * Float11.log(x));
            else
                return NaN;
        }
    };
    return Float11;
}());
/**
 * Square root from 3
 */
Float11.SQRT3 = 1.7320508075688772;
/**
 * Log10 constant
 */
Float11.LOG10 = 2.302585092994046;
/**
 * ln(0.5) constant
 */
Float11.LOGdiv2 = -0.6931471805599453;
Float11["__class"] = "Float11";
/**
 * Creates a new instance of Arcots
 * @param {number} Year
 * @class
 * @author Boris
 */
var Arcots = (function () {
    function Arcots(Year) {
        this.F = [0, 0, 0, 0, 0, 0, 0];
        this.V0U = [0, 0, 0, 0, 0, 0, 0];
        /*private*/ this.A = [0, 0, 0, 0, 0, 0];
        /*private*/ this.B = [0, 0, 0, 0, 0, 0, 0];
        /*private*/ this.C = (function (s) { var a = []; while (s-- > 0)
            a.push(0); return a; })(16);
        /*private*/ this.DX = [0, 0, 0, 0, 0];
        /*private*/ this.DL = [0, 0, 0];
        /*private*/ this.DV = [0, 0, 0, 0, 0, 0, 0];
        this.FH = [0, 0, 0, 0, 0, 0, 0];
        this.FHS = [0, 0, 0, 0, 0, 0, 0];
        this.FHSS = [0, 0, 0, 0, 0, 0, 0];
        this.VUG = [0, 0, 0, 0, 0, 0, 0];
        if (this.Y === undefined)
            this.Y = 0;
        this.Y = Year;
        var YH = this.Y + 0.5;
        this.NODFAC(YH);
        this.VZEROU(this.Y, YH, 1);
        for (var L = 0; L < 7; L++) {
            {
                this.FH[L] = this.F[L] * Arcots.H_$LI$()[L];
                this.FHS[L] = this.FH[L] * Arcots.S_$LI$()[L];
                this.FHSS[L] = this.FHS[L] * Arcots.S_$LI$()[L];
                this.VUG[L] = this.V0U[L] - Arcots.G_$LI$()[L];
            }
            ;
        }
    }
    Arcots.MA_$LI$ = function () { if (Arcots.MA == null)
        Arcots.MA = ["M2", "S2", "N2", "K2", "K1", "01", "P1"]; return Arcots.MA; };
    ;
    Arcots.H_$LI$ = function () { if (Arcots.H == null)
        Arcots.H = [25.1, 15.8, 4.6, 4.4, 18.2, 5.0, 5.9]; return Arcots.H; };
    ;
    Arcots.G_$LI$ = function () { if (Arcots.G == null)
        Arcots.G = [4.842, 4.955, 4.815, 4.752, 1.215, 1.079, 1.133]; return Arcots.G; };
    ;
    Arcots.S_$LI$ = function () { if (Arcots.S == null)
        Arcots.S = [0.50586805, 0.52359878, 0.49636692, 0.52503234, 0.26251617, 0.24335188, 0.26108261]; return Arcots.S; };
    ;
    /*private*/ Arcots.prototype.NODFAC = function (Y) {
        this.DX = this.INUXI(Y, 1);
        this.TIMCOF(Y);
        this.C[0] = Math.sin(this.DX[0]);
        this.C[1] = this.C[0] * this.C[0];
        this.C[2] = Math.sin(2.0 * this.DX[0]);
        this.C[3] = Math.cos(this.DX[0] / 2.0) * Math.cos(this.DX[0] / 2.0);
        this.F[0] = this.B[0] * this.C[3] * this.C[3];
        this.F[1] = 1.0;
        this.F[2] = this.F[0];
        this.F[3] = Math.sqrt(this.B[2] * this.C[1] * this.C[1] + this.B[5] * this.C[1] * Math.cos(2.0 * this.DX[1]) + this.B[6]);
        this.F[4] = Math.sqrt(this.B[1] * this.C[2] * this.C[2] + this.B[4] * this.C[2] * Math.cos(this.DX[1]) + this.B[6]);
        this.F[5] = this.B[3] * this.C[0] * this.C[3];
        this.F[6] = 1.0;
        return;
    };
    /*private*/ Arcots.prototype.INUXI = function (Y, IRD) {
        this.TIMCOF(Y);
        var DN = this.NLONG(Y, 1);
        this.C[0] = DN / 2.0;
        this.C[1] = Math.sin(this.C[0]) / Math.cos(this.C[0]);
        this.C[2] = Float11.atan(this.A[2] * this.C[1]);
        var AR = this.A[0] - this.A[1] * Math.cos(DN);
        this.DX[0] = Float11.acos(AR);
        this.C[3] = Math.sin(2.0 * this.DX[0]);
        this.C[4] = Math.sin(this.DX[0]) * Math.sin(this.DX[0]);
        this.DX[1] = this.C[2] - Float11.atan(this.A[3] * this.C[1]);
        this.C[5] = 2.0 * this.DX[1];
        this.DX[2] = Float11.atan(this.C[3] * Math.sin(this.DX[1]) / (this.A[4] + this.C[3] * Math.cos(this.DX[1])));
        this.DX[3] = Float11.atan(this.C[4] * Math.sin(this.C[5]) / (this.A[5] + this.C[4] * Math.cos(this.C[5])));
        this.DX[4] = DN + this.DX[1] - 2.0 * this.C[2];
        for (var i = 0; i < 5; i++) {
            {
                if (this.DX[i] < 0.0) {
                    this.DX[i] = this.DX[i] + 2.0 * 3.14159265359;
                }
            }
            ;
        }
        if (IRD === 1)
            return this.DX;
        for (var i = 0; i < 5; i++) {
            {
                this.DX[i] = this.DX[i] * 180.0 / 3.14159265359;
            }
            ;
        }
        return this.DX;
    };
    /*private*/ Arcots.prototype.TIMCOF = function (Y) {
        this.C[0] = 0.45987564;
        this.C[1] = 0.05490056;
        this.C[2] = 5.14537628;
        this.C[3] = Y - 1900.0;
        this.C[4] = 0.01675104 - 4.18E-7 * this.C[3] - 1.26E-11 * this.C[3] * this.C[3];
        this.C[5] = 23.452294 - 1.30111E-4 * this.C[3];
        var P = 3.14159265359;
        P = 180.0 / P;
        this.C[6] = P;
        this.C[7] = Math.sin(this.C[2] / P);
        this.C[8] = Math.sin(this.C[5] / P);
        this.C[9] = (this.C[5] - this.C[2]) / 2.0;
        this.C[10] = (this.C[5] + this.C[2]) / 2.0;
        this.C[11] = Math.sin(this.C[5] * 2.0 / P);
        this.C[12] = Math.cos(this.C[5] * 0.5 / P);
        this.C[13] = Math.cos(this.C[2] * 0.5 / P);
        this.C[14] = 1.0 - 1.5 * this.C[7] * this.C[7];
        this.A[0] = Math.cos(this.C[2] / P) * Math.cos(this.C[5] / P);
        this.A[1] = this.C[7] * this.C[8];
        this.A[2] = Math.cos(this.C[9] / P) / Math.cos(this.C[10] / P);
        this.A[3] = Math.sin(this.C[9] / P) / Math.sin(this.C[10] / P);
        this.C[15] = this.C[0] * (1.0 + 1.5 * this.C[4] * this.C[4]) / (1.0 + 1.5 * this.C[1] * this.C[1]);
        this.A[4] = this.C[15] * this.C[11];
        this.A[5] = this.C[15] * this.C[8] * this.C[8];
        this.B[0] = 1.0 / ((this.C[12] * this.C[13]) * (this.C[12] * this.C[13]) * (this.C[12] * this.C[13]) * (this.C[12] * this.C[13]));
        this.B[1] = 1.0 / ((this.A[4] + this.C[14] * this.C[11]) * (this.A[4] + this.C[14] * this.C[11]));
        this.B[2] = 1.0 / (this.A[5] + this.C[14] * this.C[8] * this.C[8]) / (this.A[5] + this.C[14] * this.C[8] * this.C[8]);
        this.B[3] = 1.0 / this.C[12] / this.C[12] / this.C[13] / this.C[13] / this.C[13] / this.C[13] / this.C[8];
        this.B[4] = 2.0 * this.A[4] * this.B[1];
        this.B[5] = 2.0 * this.A[5] * this.B[2];
        this.B[6] = this.B[1] * this.A[4] * this.A[4];
        return;
    };
    /*private*/ Arcots.prototype.NLONG = function (Y, IRD) {
        var T;
        var T2;
        var T3;
        var DN;
        var Y0;
        var TR;
        Y0 = Y - 1900.0;
        TR = (((((Y0) | 0) - 1) / 4 | 0)) + 0.5;
        T = (365.0 * Y0 + TR) / 36525.0;
        T2 = T * T;
        T3 = T * T * T;
        DN = 259.182533 - 1934.142397 * T + 0.002106 * T2 + 2.22E-6 * T3;
        while ((DN < 0.0)) {
            {
                DN = DN + 360.0;
            }
        }
        ;
        if (IRD === 0)
            return DN;
        DN = DN * 3.14159265359 / 180.0;
        return DN;
    };
    /*private*/ Arcots.prototype.VZEROU = function (Y, YH, IRD) {
        var AF = 360.0;
        var A4 = 90.0;
        var A34 = 270.0;
        var DR;
        if (IRD === 1) {
            DR = 3.14159265359 / 180.0;
            AF = AF * DR;
            A4 = A4 * DR;
            A34 = A34 * DR;
        }
        this.HSPLON(Y, IRD);
        this.INUXI(YH, IRD);
        this.DV[0] = 2.0 * (this.DL[0] - this.DL[1] + this.DX[4] - this.DX[1]);
        this.DV[2] = 2.0 * (this.DL[0] + this.DX[4] - this.DX[1]) - 3.0 * this.DL[1] + this.DL[2];
        this.DV[3] = 2.0 * this.DL[0] - this.DX[3];
        this.DV[4] = this.DL[0] + A4 - this.DX[2];
        this.DV[5] = this.DL[0] - 2.0 * this.DL[1] + A34 + 2.0 * this.DX[4] - this.DX[1];
        this.DV[6] = A34 - this.DL[0];
        for (var i = 0; i < 7; i++) {
            {
                if (i === 1)
                    continue;
                this.DV[i] = this.DV[i] + AF;
                while ((this.DV[i] < 0.0)) {
                    {
                        this.DV[i] = this.DV[i] + AF;
                    }
                }
                ;
                this.V0U[i] = this.DV[i] % AF;
            }
            ;
        }
        this.V0U[1] = 0.0;
        return;
    };
    /*private*/ Arcots.prototype.HSPLON = function (Y, IRD) {
        var T;
        var T2;
        var T3;
        var TR;
        var Y0 = Y - 1900.0;
        TR = (((((Y0) | 0) - 1) / 4 | 0)) + 0.5;
        T = (365.0 * Y0 + TR) / 36525.0;
        T2 = T * T;
        T3 = T2 * T;
        this.DL[0] = 279.696678 + 36000.768925 * T + 3.025E-4 * T2;
        this.DL[1] = 270.437422 + 481267.892 * T + 0.002525 * T2 + 1.89E-6 * T3;
        this.DL[2] = 334.328019 + 4069.032206 * T - 0.010344 * T2 - 1.25E-5 * T3;
        for (var i = 0; i < 3; i++) {
            {
                this.DL[i] = this.DL[i] % 360.0;
            }
            ;
        }
        if (IRD === 0)
            return;
        for (var i = 0; i < 3; i++) {
            {
                this.DL[i] = this.DL[i] * 3.14159265359 / 180.0;
            }
            ;
        }
        return;
    };
    /*private*/ Arcots.prototype.arctan = function (X) {
        var x;
        var y = 0.0;
        var n = 1000;
        var x1 = X;
        y = x1;
        x = x1;
        var sign = 1;
        for (var i = 3; i < n; i += 2) {
            {
                sign *= (-1);
                x = x * x1 * x1;
                y += sign * x / i;
            }
            ;
        }
        return y;
    };
    /*private*/ Arcots.prototype.arccos = function (X) {
        var x;
        var y = 0.0;
        var n = 25;
        var numer = 1;
        var denom = 1;
        var x1 = Math.sqrt(1.0 - X * X);
        y = x1;
        x = x1;
        for (var i = 3; i < n; i += 2) {
            {
                numer *= (i - 2);
                denom *= (i - 1);
                x = x * x1 * x1;
                y += numer * x / denom / i;
            }
            ;
        }
        return y;
    };
    return Arcots;
}());
Arcots["__class"] = "Arcots";
Arcots.S_$LI$();
Arcots.G_$LI$();
Arcots.H_$LI$();
Arcots.MA_$LI$();

