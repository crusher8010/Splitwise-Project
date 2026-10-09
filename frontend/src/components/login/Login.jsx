import {useState} from "react";

import { VscSettings } from "react-icons/vsc";
import style from "./Login.module.css";

export default function Login(){
    const [defaultView, setDefaultView] = useState(false);



    return (
        <div className={style.loginContainer}>
            <div className={style.loginDescription}>
                <div className={style['login-header']}>
                    <div className={style['login-icon']}>
                        <VscSettings />
                    </div>
                    <span className={style['login-title']}>Tally</span>
                </div>

                <div className={style['login-content']}>
                    <span className={style['login-subtitle-title']}>
                        Shared expenses, settled
                    </span>
                    <span className={style['login-subtitle-header']}>
                        Nobody has to remember who paid for the cab.
                    </span>
                    <span className={style['login-subtitle-content']}>
                        Every balance is recomputed from the expense ledger on read — so editing an expense can never leave a stale total behind.
                    </span>
                </div>

                <div className={style['login-footer']}>
                    <div className={style['section']}>
                        <span className={style['section-header']}>₹0.00</span>
                        <span className={style['section-content']}>rounding loss, ever</span>
                    </div>
                    <div className={style['section']}>
                        <span className={style['section-header']}>n−1</span>
                        <span className={style['section-content']}>payments to clear a group</span>
                    </div>
                </div>
            </div>
            <div className={style['loginForm-containerSection']}>
                <div className={style['loginContainer-form']}>
                    {defaultView ? (
                        <div className={style['loginForm']}>
                        <div className={style['loginForm-header']}>
                            <span className={style['loginContainer-title']}>Welcome back</span>
                        <p className={style['loginContainer-subTitle']}>Log in to pick up where the ledger left off.</p>
                        </div>
                        
                        <div className={style['loginContainer-field']}>
                            <label>Email</label>
                            <input type="email" placeholder="johnDoe@example.com" />
                        </div>
                        <div className={style['loginContainer-field']}>
                            <label>Password</label>
                            <input type="password" placeholder="At least 8 characters" />
                        </div>
                        <button className={style['loginContainer-button']} onClick={() => setDefaultView(true)}>Log in</button>

                        <div className={style['loginContainer-footer']}>
                            <span>New here ?</span>
                            <span onClick={() => setDefaultView(false)}>Create an account</span>
                        </div>
                    </div>
                    ): (
                        <div className={style['loginForm']}>
                            <div className={style['loginForm-header']}>
                                <span className={style['loginContainer-title']}>Create your account</span>
                                <p className={style['loginContainer-subTitle']}>
                                    Groups you were already added to will be waiting for you.
                                </p>
                            </div>
                            <div className={style.nameSection}>
                                <div className={style['nameSection-field']}>
                                    <label>First Name</label>
                                    <input type="text" placeholder="John" />
                                </div>
                                <div className={style['nameSection-field']}>
                                    <label>Last Name</label>
                                    <input type="text" placeholder="Doe" />
                                </div>
                            </div>
                            <div className={style['loginContainer-field']}>
                                <label>Email</label>
                                <input type="email" placeholder="johnDoe@example.com" />
                            </div>
                            <div className={style['loginContainer-field']}>
                                <label>Mobile Number</label>
                                <div className={style['loginContainer-field-subField']}>
                                    <input type="tel" placeholder="123-456-7890" />
                                    <p>Unique across accounts. It is the key that adopts any group you were added to before signing up.</p>
                                </div>
                                
                            </div>
                            
                            <div className={style['loginContainer-field']}>
                                <label>Password</label>
                                <div className={style['loginContainer-field-subField']}>
                                    <input type="password" placeholder="At least 8 characters" />
                                    <p>Minimum 8 characters — enforced server-side.</p>
                                </div>
                            </div>

                            <button className={style['loginContainer-button']} onClick={() => setDefaultView(false)}>Create account</button>

                            <div className={style['loginContainer-footer']}>
                                <span>Already have an account ?</span>
                                <span onClick={() => setDefaultView(true)}>Log in</span>
                            </div>

                        </div>
                    )}
                    
                    
                </div>
            </div>
        </div>        
    )
}