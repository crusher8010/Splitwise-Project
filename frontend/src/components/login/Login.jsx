import { useState } from "react";
import { VscSettings } from "react-icons/vsc";
import style from "./Login.module.css";

const STATS = [
    { value: "₹0.00", label: "rounding loss, ever" },
    { value: "n−1", label: "payments to clear a group" },
];

const EMAIL = { label: "Email", type: "email", placeholder: "johnDoe@example.com" };
const PASSWORD = { label: "Password", type: "password", placeholder: "At least 8 characters" };

const FORMS = {
    login: {
        title: "Welcome back",
        subtitle: "Log in to pick up where the ledger left off.",
        fields: [EMAIL, PASSWORD],
        button: "Log in",
        switchText: "New here ?",
        switchLabel: "Create an account",
    },
    signup: {
        title: "Create your account",
        subtitle: "Groups you were already added to will be waiting for you.",
        names: [
            { label: "First Name", type: "text", placeholder: "John" },
            { label: "Last Name", type: "text", placeholder: "Doe" },
        ],
        fields: [
            EMAIL,
            {
                label: "Mobile Number",
                type: "tel",
                placeholder: "123-456-7890",
                hint: "Unique across accounts. It is the key that adopts any group you were added to before signing up.",
            },
            { ...PASSWORD, hint: "Minimum 8 characters — enforced server-side." },
        ],
        button: "Create account",
        switchText: "Already have an account ?",
        switchLabel: "Log in",
    },
};

const Input = ({ label, type, placeholder }) => (
    <>
        <label>{label}</label>
        <input type={type} placeholder={placeholder} />
    </>
);

export default function Login() {
    const [isLogin, setIsLogin] = useState(false);
    const form = FORMS[isLogin ? "login" : "signup"];

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
                    <div className={style.loginForm}>
                        <div className={style["loginForm-header"]}>
                            <span className={style["loginContainer-title"]}>{form.title}</span>
                            <p className={style["loginContainer-subTitle"]}>{form.subtitle}</p>
                        </div>

                        {form.names && (
                            <div className={style.nameSection}>
                                {form.names.map((f) => (
                                    <div key={f.label} className={style["nameSection-field"]}>
                                        <Input {...f} />
                                    </div>
                                ))}
                            </div>
                        )}

                        {form.fields.map((f) => (
                            <div key={f.label} className={style["loginContainer-field"]}>
                                {f.hint ? (
                                    <>
                                        <label>{f.label}</label>
                                        <div className={style["loginContainer-field-subField"]}>
                                            <input type={f.type} placeholder={f.placeholder} />
                                            <p>{f.hint}</p>
                                        </div>
                                    </>
                                ) : (
                                    <Input {...f} />
                                )}
                            </div>
                        ))}

                        <button className={style["loginContainer-button"]}>{form.button}</button>

                        <div className={style["loginContainer-footer"]}>
                            <span>{form.switchText}</span>
                            <span onClick={() => setIsLogin(!isLogin)}>{form.switchLabel}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
