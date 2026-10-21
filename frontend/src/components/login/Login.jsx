import { useState } from "react";
import { VscSettings } from "react-icons/vsc";
import style from "./Login.module.css";
import GoogleButton from "./GoogleButton";
import { api } from "../../api";

const STATS = [
    { value: "₹0.00", label: "rounding loss, ever" },
    { value: "n−1", label: "payments to clear a group" },
];

const EMAIL = { name: "email", label: "Email", type: "email", placeholder: "johnDoe@example.com" };
const PASSWORD = { name: "password", label: "Password", type: "password", placeholder: "At least 8 characters" };

const FORMS = {
    login: {
        title: "Welcome back",
        subtitle: "Log in to pick up where the ledger left off.",
        fields: [EMAIL, PASSWORD],
        button: "Log in",
        showForgot: true,
        showGoogle: true,
        switchText: "New here ?",
        switchLabel: "Create an account",
        switchTo: "signup",
    },
    signup: {
        title: "Create your account",
        subtitle: "Groups you were already added to will be waiting for you.",
        names: [
            { name: "firstName", label: "First Name", type: "text", placeholder: "John" },
            { name: "lastName", label: "Last Name", type: "text", placeholder: "Doe" },
        ],
        fields: [
            EMAIL,
            {
                name: "mobileNo",
                label: "Mobile Number",
                type: "tel",
                placeholder: "123-456-7890",
                hint: "Unique across accounts. It is the key that adopts any group you were added to before signing up.",
            },
            { ...PASSWORD, hint: "Minimum 8 characters — enforced server-side." },
        ],
        button: "Create account",
        showGoogle: true,
        switchText: "Already have an account ?",
        switchLabel: "Log in",
        switchTo: "login",
    },
    mobile: {
        title: "One last step",
        subtitle: "Add your mobile number so groups you were already added to can find you.",
        fields: [{ name: "mobileNo", label: "Mobile Number", type: "tel", placeholder: "123-456-7890" }],
        button: "Save and continue",
    },
    forgot: {
        title: "Forgot your password?",
        subtitle: "Enter your email and we'll send you a link to reset it.",
        fields: [EMAIL],
        button: "Send reset link",
        switchText: "Remembered it ?",
        switchLabel: "Back to log in",
        switchTo: "login",
    },
};

const Input = ({ label, type, placeholder, hint, value, onChange }) => {
    const input = <input type={type} placeholder={placeholder} value={value} onChange={onChange} />;
    return (
        <>
            <label>{label}</label>
            {hint ? (
                <div className={style["loginContainer-field-subField"]}>
                    {input}
                    <p>{hint}</p>
                </div>
            ) : (
                input
            )}
        </>
    );
};

const EMPTY = { firstName: "", lastName: "", email: "", mobileNo: "", password: "" };

// What each view sends, and what to tell the user when it works.
const ACTIONS = {
    signup: {
        run: (v) =>
            api("/user/signup", {
                method: "POST",
                body: {
                    firstName: v.firstName,
                    lastName: v.lastName,
                    email: v.email,
                    mobileNo: v.mobileNo,
                    password: v.password,
                },
            }),
        done: (res) => `Account created! Welcome, ${res.data.firstName}.`,
    },
    login: {
        run: (v) => api("/user/login", { method: "POST", body: { email: v.email, password: v.password } }),
        done: (res) => `Welcome back, ${res.data.firstName}! You are logged in.`,
    },
    forgot: {
        run: (v) => api("/user/forgot-password", { method: "POST", body: { email: v.email } }),
        done: () => "Check your inbox — we've sent you a link to reset your password.",
    },
    mobile: {
        run: (v) =>
            api("/user/me/mobile", {
                method: "PATCH",
                body: { mobileNo: v.mobileNo },
                token: localStorage.getItem("token"),
            }),
        done: () => "All set! Your account is ready.",
    },
};

export default function Login() {
    const [view, setView] = useState("signup");
    const form = FORMS[view];
    const [values, setValues] = useState(EMPTY);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [loading, setLoading] = useState(false);

    const setField = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.value }));

    const goTo = (next) => {
        setError("");
        setNotice("");
        setValues((v) => ({ ...v, password: "" }));
        setView(next);
    };

    const handleGoogle = async (credential) => {
        setError("");
        try {
            const res = await api("/user/google", { method: "POST", body: { credential } });
            localStorage.setItem("token", res.token);
            if (res.needsMobile) return goTo("mobile");
            setNotice(`Welcome, ${res.data.firstName}! You are logged in.`);
        } catch (err) {
            setError(err.message);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setNotice("");
        setLoading(true);
        try {
            const { run, done } = ACTIONS[view];
            const res = await run(values);
            if (res.token) localStorage.setItem("token", res.token);
            setNotice(done(res));
            setValues((v) => ({ ...v, password: "" }));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={style.loginContainer}>
            <div className={style.loginDescription}>
                <div className={style["login-header"]}>
                    <div className={style["login-icon"]}>
                        <VscSettings />
                    </div>
                    <span className={style["login-title"]}>Tally</span>
                </div>

                <div className={style["login-content"]}>
                    <span className={style["login-subtitle-title"]}>Shared expenses, settled</span>
                    <span className={style["login-subtitle-header"]}>
                        Nobody has to remember who paid for the cab.
                    </span>
                    <span className={style["login-subtitle-content"]}>
                        Every balance is recomputed from the expense ledger on read — so editing an expense can never leave a stale total behind.
                    </span>
                </div>

                <div className={style["login-footer"]}>
                    {STATS.map(({ value, label }) => (
                        <div key={value} className={style.section}>
                            <span className={style["section-header"]}>{value}</span>
                            <span className={style["section-content"]}>{label}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className={style["loginForm-containerSection"]}>
                <div className={style["loginContainer-form"]}>
                    <form className={style.loginForm} onSubmit={handleSubmit} noValidate>
                        <div className={style["loginForm-header"]}>
                            <span className={style["loginContainer-title"]}>{form.title}</span>
                            <p className={style["loginContainer-subTitle"]}>{form.subtitle}</p>
                        </div>

                        {form.names && (
                            <div className={style.nameSection}>
                                {form.names.map((f) => (
                                    <div key={f.name} className={style["nameSection-field"]}>
                                        <Input {...f} value={values[f.name]} onChange={setField(f.name)} />
                                    </div>
                                ))}
                            </div>
                        )}

                        {form.fields.map((f) => (
                            <div key={f.name} className={style["loginContainer-field"]}>
                                <Input {...f} value={values[f.name]} onChange={setField(f.name)} />
                            </div>
                        ))}

                        {form.showForgot && (
                            <span
                                className={style["loginContainer-forgot"]}
                                onClick={() => goTo("forgot")}
                            >
                                Forgot password?
                            </span>
                        )}

                        {error && <p className={style["loginContainer-error"]}>{error}</p>}
                        {notice && <p className={style["loginContainer-notice"]}>{notice}</p>}

                        <button type="submit" className={style["loginContainer-button"]} disabled={loading}>
                            {loading ? "Please wait..." : form.button}
                        </button>

                        {form.showGoogle && (
                            <>
                                <div className={style["loginContainer-divider"]}>or</div>
                                <GoogleButton
                                    key={view}
                                    onCredential={handleGoogle}
                                    label={view === "signup" ? "Sign up with Google" : "Log in with Google"}
                                />
                            </>
                        )}

                        {form.switchTo && (
                            <div className={style["loginContainer-footer"]}>
                                <span>{form.switchText}</span>
                                <span onClick={() => goTo(form.switchTo)}>{form.switchLabel}</span>
                            </div>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
}
