import { VscSettings } from "react-icons/vsc";
import style from "./Login.module.css";

export default function Login(){
    return (
        <div className={style.loginContainer}>
            <div className={style.loginDescription}>
                <div className="login-header">
                    <div className="login-icon">
                        <VscSettings />
                    </div>
                    <span className="login-title">Tally</span>
                </div>

                <div className="login-content">
                    <span className="login-subtitle-header">
                        Nobody has to remember who paid for the cab.
                    </span>
                    <span className="login-subtitle-content">
                        Every balance is recomputed from the expense ledger on read — so editing an expense can never leave a stale total behind.
                    </span>
                </div>

                <div className="login-footer">
                    <div className="section">
                        <span className="section-header">₹0.00</span>
                        <span className="section-content">rounding loss, ever</span>
                    </div>
                    <div className="section">
                        <span className="section-header">n−1</span>
                        <span className="section-content">payments to clear a group</span>
                    </div>
                </div>
            </div>
            <div className={style.loginForm}></div>
        </div>        
    )
}