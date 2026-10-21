import { useEffect, useRef } from "react";
import style from "./Login.module.css";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_MAX_WIDTH = 400; // renderButton() refuses anything wider

let scriptPromise;
const loadGoogle = () =>
    (scriptPromise ??= new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = SRC;
        s.async = true;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    }));

const GoogleLogo = () => (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
        <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.100 0 24s.9 7.600 2.600 10.800l7.900-6.100z"/>
        <path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.500-5.800c-2.100 1.400-4.800 2.300-8.400 2.300-6.300 0-11.600-4-13.500-9.800l-7.900 6.100C6.500 42.600 14.600 48 24 48z"/>
    </svg>
);

// Google's own button can't be made full width or restyled, so we draw ours
// and lay Google's real (invisible) button on top, stretched to fit. The click
// lands on Google's button, which is what hands us the signed ID token.
export default function GoogleButton({ onCredential, label = "Continue with Google" }) {
    const wrapRef = useRef(null);
    const overlayRef = useRef(null);
    const callback = useRef(onCredential);

    // Keep the latest handler without re-initialising Google on every render.
    useEffect(() => {
        callback.current = onCredential;
    });

    useEffect(() => {
        let cancelled = false;
        const wrap = wrapRef.current;
        const overlay = overlayRef.current;

        const fit = () => {
            overlay.style.transform = `scaleX(${wrap.offsetWidth / GOOGLE_MAX_WIDTH})`;
        };

        loadGoogle().then(() => {
            if (cancelled) return;
            window.google.accounts.id.initialize({
                client_id: CLIENT_ID,
                callback: ({ credential }) => callback.current(credential),
            });
            window.google.accounts.id.renderButton(overlay, {
                size: "large",
                width: GOOGLE_MAX_WIDTH,
            });
            fit();
        });

        const observer = new ResizeObserver(fit);
        observer.observe(wrap);
        return () => {
            cancelled = true;
            observer.disconnect();
        };
    }, []);

    return (
        <div ref={wrapRef} className={style["google-button"]}>
            <span className={style["google-button-face"]}>
                <GoogleLogo />
                {label}
            </span>
            <div ref={overlayRef} className={style["google-button-overlay"]} />
        </div>
    );
}
