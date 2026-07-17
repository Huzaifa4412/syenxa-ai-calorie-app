import { useEffect, useRef, useState } from "react";
import {
    Activity,
    AlertTriangle,
    Beef,
    Camera,
    Check,
    ChevronRight,
    Droplets,
    Flame,
    ImagePlus,
    Leaf,
    LockKeyhole,
    LogOut,
    ScanLine,
    Sparkles,
    Wheat,
    X,
    Zap,
} from "lucide-react";
import { useAuth } from "../auth/use-auth";
import { AnalysisApiError, analyzeMeal } from "../lib/analyze-meal";
import { getScanQuota } from "../lib/quota";
import type { MealAnalysis, ScanQuota } from "../types";
import AuthPanel from "./auth-panel";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2048;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const getResetCopy = (resetAt: string | null) => {
    if (!resetAt) return "within 24 hours";
    const milliseconds = new Date(resetAt).getTime() - Date.now();
    if (milliseconds <= 0) return "now";
    const totalMinutes = Math.ceil(milliseconds / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const getFileExtension = (file: File) => file.name.split(".").pop()?.toLowerCase() ?? "";

const getFileFormatLabel = (file: File) => {
    const extension = getFileExtension(file);
    if (extension) return extension.toUpperCase();
    if (file.type) return file.type.replace(/^image\//, "").toUpperCase();
    return "Unknown format";
};

const prepareMealImage = async (file: File): Promise<File> => {
    if (!("createImageBitmap" in window)) return file;

    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const longestSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / longestSide);

    if (scale === 1 && file.size <= 5 * 1024 * 1024 && file.type === "image/jpeg") {
        bitmap.close();
        return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });

    if (!context) {
        bitmap.close();
        throw new Error("This browser could not prepare the photo. Try a smaller image.");
    }

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const optimizedBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("This photo could not be prepared. Try another image."));
        }, "image/jpeg", 0.88);
    });

    const baseName = file.name.replace(/\.[^.]+$/, "") || "meal";
    return new File([optimizedBlob], `${baseName}-optimized.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
    });
};

const UploadFiles = () => {
    const { user, loading: authLoading, signOut } = useAuth();
    const [result, setResult] = useState<MealAnalysis | null>(null);
    const [quota, setQuota] = useState<ScanQuota | null>(null);
    const [quotaLoading, setQuotaLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [, refreshClock] = useState(0);

    useEffect(() => {
        if (!user) {
            setQuota(null);
            setQuotaLoading(false);
            setResult(null);
            setImagePreview(null);
            setError(null);
            return;
        }

        let active = true;
        setQuotaLoading(true);
        getScanQuota()
            .then((nextQuota) => {
                if (active) setQuota(nextQuota);
            })
            .catch(() => {
                if (active) setError("We couldn't load your scan allowance. Refresh and try again.");
            })
            .finally(() => {
                if (active) setQuotaLoading(false);
            });

        return () => { active = false; };
    }, [user]);

    useEffect(() => {
        if (!quota?.resetAt || quota.remaining > 0) return;
        let active = true;
        const refreshQuotaClock = () => {
            refreshClock((value) => value + 1);
            if (new Date(quota.resetAt as string).getTime() > Date.now()) return;

            setQuotaLoading(true);
            void getScanQuota()
                .then((nextQuota) => {
                    if (active) setQuota(nextQuota);
                })
                .catch(() => {
                    if (active) setError("We couldn't refresh your scan allowance. Refresh and try again.");
                })
                .finally(() => {
                    if (active) setQuotaLoading(false);
                });
        };
        const timer = window.setInterval(refreshQuotaClock, 30_000);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, [quota]);

    useEffect(() => {
        return () => {
            if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
        };
    }, [imagePreview]);

    useEffect(() => {
        const motionRoot = document.documentElement;
        const revealItems = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        motionRoot.classList.add("motion-ready");

        if (reducedMotion || !("IntersectionObserver" in window)) {
            revealItems.forEach((item) => item.classList.add("is-visible"));
            return () => motionRoot.classList.remove("motion-ready");
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.04, rootMargin: "0px 0px -4%" });

        revealItems.forEach((item) => observer.observe(item));

        return () => {
            observer.disconnect();
            motionRoot.classList.remove("motion-ready");
        };
    }, []);

    useEffect(() => {
        if (!cameraOpen) return;

        let active = true;
        let stream: MediaStream | null = null;
        const videoElement = videoRef.current;
        const previousOverflow = document.body.style.overflow;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setCameraOpen(false);
        };

        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", closeOnEscape);

        const startCamera = async () => {
            if (!navigator.mediaDevices?.getUserMedia) {
                setCameraError("Live camera is not supported in this browser. Use the device camera option below.");
                return;
            }

            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: { facingMode: { ideal: "environment" } },
                });

                if (!active) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }

                if (videoElement) {
                    videoElement.srcObject = stream;
                    await videoElement.play();
                }
            } catch {
                if (active) {
                    setCameraError("Camera access was blocked or unavailable. Allow permission, or use the device camera option below.");
                }
            }
        };

        void startCamera();

        return () => {
            active = false;
            setCameraReady(false);
            stream?.getTracks().forEach((track) => track.stop());
            if (videoElement) videoElement.srcObject = null;
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [cameraOpen]);

    const handleUpload = async (file: File) => {
        if (!user) {
            setError("Sign in before scanning a meal.");
            return;
        }
        if (quotaLoading || !quota) {
            setError("Your scan allowance is still loading. Please wait a moment.");
            return;
        }
        if (quota.remaining === 0) {
            setError(`Your free scans reset in ${getResetCopy(quota.resetAt)}.`);
            return;
        }
        const extension = getFileExtension(file);
        const supportedFormat = ALLOWED_IMAGE_TYPES.has(file.type)
            || (!file.type && ALLOWED_IMAGE_EXTENSIONS.has(extension));

        if (!supportedFormat) {
            setError(`${getFileFormatLabel(file)} files are not supported. Choose a JPG, JPEG, PNG, or WEBP image.`);
            return;
        }
        if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
            setError("Choose an image smaller than 25 MB.");
            return;
        }

        setError(null);
        setLoading(true);
        try {
            let preparedFile: File;
            try {
                preparedFile = await prepareMealImage(file);
            } catch {
                throw new Error("This image could not be read. Choose a valid JPG, JPEG, PNG, or WEBP file.");
            }
            setImagePreview(URL.createObjectURL(preparedFile));

            const data = await analyzeMeal(preparedFile);
            setResult(data.output);
            setQuota(data.quota);
        } catch (caught) {
            if (caught instanceof AnalysisApiError) {
                if (caught.quota) setQuota(caught.quota);
                if (caught.status === 401) await signOut().catch(() => undefined);
                setError(caught.message);
            } else if (caught instanceof TypeError) {
                setError("The scanner could not reach the nutrition workflow. Check your connection and try again.");
            } else {
                setError(caught instanceof Error ? caught.message : "Meal analysis failed. Check your connection and try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    const openCamera = () => {
        setCameraError(null);
        setCameraReady(false);
        setCameraOpen(true);
    };

    const captureCameraPhoto = () => {
        const video = videoRef.current;
        if (!video?.videoWidth || !video.videoHeight) {
            setCameraError("The camera is still starting. Wait a moment and try again.");
            return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d");

        if (!context) {
            setCameraError("The photo could not be captured. Please use the gallery instead.");
            return;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            if (!blob) {
                setCameraError("The photo could not be captured. Please try again.");
                return;
            }

            const photo = new File([blob], `syenxa-calories-meal-${Date.now()}.jpg`, { type: "image/jpeg" });
            setCameraOpen(false);
            void handleUpload(photo);
        }, "image/jpeg", 0.92);
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (!quotaLoading && quota?.remaining !== 0 && e.dataTransfer.files?.[0]) {
            void handleUpload(e.dataTransfer.files[0]);
        }
    };

    const quotaExhausted = quota?.remaining === 0;
    const canScan = Boolean(user);
    const displayName = user?.user_metadata.full_name || user?.user_metadata.name || user?.email?.split("@")[0];

    const macroItems = result
        ? [
            { label: "Protein", value: result.total.protein, unit: "g", icon: Beef },
            { label: "Carbs", value: result.total.carbs, unit: "g", icon: Wheat },
            { label: "Fat", value: result.total.fat, unit: "g", icon: Droplets },
        ]
        : [];

    return (
        <main className="app-shell">
            <a className="skip-link" href="#meal-scanner">Skip to meal scanner</a>

            <header className="topbar">
                <a className="brand" href="#top" aria-label="Syenxa Calories home">
                    <span className="brand-mark"><Leaf aria-hidden="true" /></span>
                    <span className="brand-name">Syenxa Calories</span>
                </a>
                {user ? (
                    <div className="user-tools">
                        <span className="quota-chip"><b>{quota?.remaining ?? "..."}</b> / 3 scans left</span>
                        <span className="user-name" title={user.email}>{displayName}</span>
                        <button
                            className="sign-out-button"
                            type="button"
                            onClick={() => void signOut().catch(() => setError("Sign out failed. Please try again."))}
                            aria-label="Sign out"
                        >
                            <LogOut size={17} />
                        </button>
                    </div>
                ) : (
                    <div className="system-status" aria-label="System status: protected analysis ready">
                        <span className="status-dot" />
                        Protected analysis ready
                    </div>
                )}
            </header>

            <section className="hero hero-v3" id="top">
                <div className="hero-copy hero-v3-copy">
                    <p className="eyebrow"><Sparkles size={14} aria-hidden="true" /> AI meal analysis</p>
                    <h1 aria-label="Know what’s on your plate.">
                        <span className="hero-title-row hero-title-row-one">
                            <span className="hero-title-token stagger-1">Know</span>
                            <span className="hero-title-token stagger-2">what’s</span>
                            <span className="hero-image-capsule capsule-greens hero-title-token stagger-3" role="img" aria-label="A colorful healthy meal">
                                <img
                                    src="https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85"
                                    alt=""
                                    aria-hidden="true"
                                    decoding="async"
                                    fetchPriority="high"
                                />
                            </span>
                        </span>
                        <span className="hero-title-row hero-title-row-two">
                            <span className="hero-image-capsule capsule-protein hero-title-token stagger-4" role="img" aria-label="A balanced chicken meal">
                                <img
                                    src="https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=900&q=85"
                                    alt=""
                                    aria-hidden="true"
                                    decoding="async"
                                />
                            </span>
                            <span className="hero-title-token stagger-5">on your</span>
                            <span className="hero-title-token stagger-6">plate.</span>
                        </span>
                    </h1>

                    <div className="hero-v3-footer">
                        <p className="hero-intro">
                            Turn one meal photo into clear calories, macros, ingredients,
                            and key nutrients.
                        </p>
                        <a className="hero-cta" href="#meal-scanner">
                            Scan a meal <Camera size={18} aria-hidden="true" />
                        </a>
                    </div>
                </div>
            </section>

            <section className={`scanner-workspace ${result ? "has-result" : ""}`} id="meal-scanner">
                <div className="workspace-heading">
                    <div>
                        <p className="section-kicker">Meal scanner</p>
                        <h2>{!canScan ? "Your free scans start here" : result ? "Your nutrition snapshot" : "Start with a clear photo"}</h2>
                    </div>
                    <span className="workspace-step">
                        {user
                            ? quotaExhausted
                                ? `Resets in ${getResetCopy(quota?.resetAt ?? null)}`
                                : quotaLoading
                                    ? "Loading scan allowance"
                                    : `${quota?.remaining ?? "..."} of 3 scans available`
                            : "Account required"}
                    </span>
                </div>

                {authLoading ? (
                    <div className="auth-loading" aria-live="polite">
                        <span className="loading-mark"><ScanLine /></span>
                        <p>Checking your session…</p>
                    </div>
                ) : !canScan ? (
                    <div className="auth-layout">
                        <aside className="auth-benefits">
                            <p className="section-kicker">A useful free tier</p>
                            <h3>Three complete scans.<br />Every 24 hours.</h3>
                            <p>Sign in once, then use Syenxa Calories for breakfast, lunch, and dinner without surprise charges.</p>
                            <div className="benefit-list">
                                <span><Check size={16} /> Full calorie estimate</span>
                                <span><Check size={16} /> Protein, carbs, and fat</span>
                                <span><Check size={16} /> Ingredient-level breakdown</span>
                                <span><LockKeyhole size={16} /> Protected personal allowance</span>
                            </div>
                        </aside>
                        <AuthPanel />
                    </div>
                ) : (
                <div className="workspace-grid">
                    <div className="capture-panel">
                        <div
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            className={`drop-zone ${dragActive ? "is-dragging" : ""} ${imagePreview ? "has-image" : ""} ${quotaExhausted ? "is-locked" : ""}`}
                        >
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={(e) => {
                                    if (e.target.files?.[0]) void handleUpload(e.target.files[0]);
                                    e.target.value = "";
                                }}
                                className="file-input"
                                id="gallery-upload"
                                aria-label="Choose a meal photo from the gallery"
                                disabled={quotaExhausted || quotaLoading || loading}
                                hidden
                            />
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                capture="environment"
                                onChange={(e) => {
                                    if (e.target.files?.[0]) {
                                        setCameraOpen(false);
                                        void handleUpload(e.target.files[0]);
                                    }
                                    e.target.value = "";
                                }}
                                className="file-input"
                                id="device-camera-capture"
                                aria-label="Take a meal photo with the device camera"
                                disabled={quotaExhausted || quotaLoading || loading}
                                hidden
                            />

                            {imagePreview ? (
                                <>
                                    <img src={imagePreview} alt="Meal selected for nutrition analysis" className="meal-preview" />
                                    <div className="scan-corners" aria-hidden="true"><i /><i /><i /><i /></div>
                                    {loading && <div className="scan-line" aria-hidden="true" />}
                                    {!quotaExhausted && (
                                        <label className="change-photo" htmlFor="gallery-upload">
                                            <ImagePlus size={17} /> Change photo
                                        </label>
                                    )}
                                </>
                            ) : quotaExhausted ? (
                                <div className="drop-content locked-content">
                                    <span className="upload-icon"><LockKeyhole aria-hidden="true" /></span>
                                    <span className="drop-title">Today’s scans are used</span>
                                    <span className="drop-help">Your next scan unlocks in {getResetCopy(quota?.resetAt ?? null)}.</span>
                                </div>
                            ) : (
                                <div className="drop-content">
                                    <span className="upload-icon"><Camera aria-hidden="true" /></span>
                                    <span className="drop-title">Drop your meal here</span>
                                    <span className="drop-help">Take a fresh photo or choose one from your device.</span>
                                    <div className="upload-actions">
                                        <button type="button" className="capture-button" onClick={openCamera} disabled={quotaLoading || loading}>
                                            <Camera size={17} /> Take live photo
                                        </button>
                                        <label className="browse-button" htmlFor="gallery-upload">
                                            <ImagePlus size={17} /> Choose gallery <ChevronRight size={16} />
                                        </label>
                                    </div>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="scanner-error" role="alert">
                                <AlertTriangle size={18} /> <span>{error}</span>
                            </div>
                        )}

                        <div className="capture-tip">
                            <Zap size={18} aria-hidden="true" />
                            <div>
                                <strong>For a sharper result</strong>
                                <span>Keep the full plate visible and use natural light.</span>
                            </div>
                        </div>

                        {result && (
                            <aside className="result-scan-card" aria-label="Scan summary">
                                <span className="result-scan-icon"><Check aria-hidden="true" /></span>
                                <div>
                                    <p>Scan complete</p>
                                    <strong>{result.food.length} {result.food.length === 1 ? "food" : "foods"} identified</strong>
                                </div>
                                <div className="result-scan-meta">
                                    <span>Confidence</span>
                                    <b>{result.confidence ?? "Estimated"}</b>
                                </div>
                            </aside>
                        )}
                    </div>

                    <div className="analysis-panel" aria-live="polite">
                        {loading ? (
                            <div className="loading-state">
                                <div className="loading-mark"><ScanLine /></div>
                                <p className="section-kicker">Reading your plate</p>
                                <h3>Analysing ingredients<br />and portions</h3>
                                <div className="loading-track"><span /></div>
                                <p className="loading-caption">This usually takes a few seconds.</p>
                            </div>
                        ) : result ? (
                            <div className="results-view">
                                <section className="calorie-summary">
                                    <div className="calorie-heading">
                                        <span className="calorie-icon"><Flame /></span>
                                        <div>
                                            <p>Total energy</p>
                                            <strong>{result.total.calories}</strong>
                                            <span>calories</span>
                                        </div>
                                    </div>
                                    <div className="macro-grid">
                                        {macroItems.map(({ label, value, unit, icon: Icon }) => (
                                            <div className="macro-stat" key={label}>
                                                <span><Icon size={17} /> {label}</span>
                                                <strong>{value}<small>{unit}</small></strong>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                <section className="food-breakdown">
                                    <div className="breakdown-heading">
                                        <div>
                                            <p className="section-kicker">Detected foods</p>
                                            <h3>Plate breakdown</h3>
                                        </div>
                                        <span>{result.food.length} {result.food.length === 1 ? "item" : "items"}</span>
                                    </div>
                                    <div className="food-list">
                                        {result.food.map((item, index) => (
                                            <article className="food-row" key={index}>
                                                <div className="food-index">{String(index + 1).padStart(2, "0")}</div>
                                                <div className="food-name">
                                                    <h4>{item.name}</h4>
                                                    <span>{item.quantity}</span>
                                                </div>
                                                <div className="food-macros">
                                                    <span><b>{item.calories}</b> cal</span>
                                                    <span><b>{item.protein}g</b> protein</span>
                                                    <span><b>{item.carbs}g</b> carbs</span>
                                                    <span><b>{item.fat}g</b> fat</span>
                                                </div>
                                            </article>
                                        ))}
                                    </div>

                                    {(result.micronutrients?.length || result.health_considerations?.length) && (
                                        <div className="nutrition-insights">
                                            <div className="insights-heading">
                                                <div>
                                                    <p className="section-kicker">Additional analysis</p>
                                                    <h3>Beyond the macros</h3>
                                                </div>
                                                {result.confidence && (
                                                    <span className={`confidence-badge confidence-${result.confidence}`}>
                                                        {result.confidence} confidence
                                                    </span>
                                                )}
                                            </div>

                                            <div className="insights-grid">
                                                {Boolean(result.micronutrients?.length) && (
                                                    <div className="insight-block">
                                                        <h4>Micronutrients</h4>
                                                        <div className="micronutrient-list">
                                                            {result.micronutrients?.map((item) => (
                                                                <div key={`${item.name}-${item.estimate}`}>
                                                                    <span>{item.name}</span>
                                                                    <strong>{item.estimate}</strong>
                                                                    <small>{item.notes}</small>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {Boolean(result.health_considerations?.length) && (
                                                    <div className="insight-block">
                                                        <h4>Health considerations</h4>
                                                        <ul>
                                                            {result.health_considerations?.map((item) => <li key={item}>{item}</li>)}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>

                                            {Boolean(result.assumptions?.length) && (
                                                <details className="assumptions">
                                                    <summary>View estimation assumptions</summary>
                                                    <ul>{result.assumptions?.map((item) => <li key={item}>{item}</li>)}</ul>
                                                </details>
                                            )}
                                            {result.disclaimer && <p className="nutrition-disclaimer">{result.disclaimer}</p>}
                                        </div>
                                    )}
                                </section>
                            </div>
                        ) : quotaExhausted ? (
                            <div className="limit-state">
                                <span className="limit-icon"><LockKeyhole /></span>
                                <p className="section-kicker">Free limit reached</p>
                                <h3>Three scans complete.</h3>
                                <p>Your allowance refreshes one scan at a time. The next one becomes available in <strong>{getResetCopy(quota?.resetAt ?? null)}</strong>.</p>
                                <div className="quota-meter" aria-label="3 of 3 scans used"><span /><span /><span /></div>
                            </div>
                        ) : (
                            <div className="empty-state">
                                <div className="empty-visual">
                                    <div className="empty-ring ring-a" />
                                    <div className="empty-ring ring-b" />
                                    <Activity />
                                </div>
                                <p className="section-kicker">Waiting for a meal</p>
                                <h3>Your breakdown will<br />appear here.</h3>
                                <p>Upload a photo to see total calories, macro estimates, and detected ingredients.</p>
                                <div className="empty-metrics" aria-hidden="true">
                                    <span>Calories</span><span>Protein</span><span>Carbs</span><span>Fat</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                )}
            </section>

            {cameraOpen && (
                <div className="camera-overlay" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setCameraOpen(false);
                }}>
                    <section className="camera-dialog" role="dialog" aria-modal="true" aria-labelledby="camera-title">
                        <header className="camera-dialog-header">
                            <div>
                                <p className="section-kicker">Live camera</p>
                                <h2 id="camera-title">Frame the full plate</h2>
                            </div>
                            <button type="button" className="camera-close" onClick={() => setCameraOpen(false)} aria-label="Close camera">
                                <X />
                            </button>
                        </header>

                        <div className={`camera-viewport ${cameraReady ? "is-ready" : ""}`}>
                            <video
                                ref={videoRef}
                                muted
                                playsInline
                                autoPlay
                                onCanPlay={() => setCameraReady(true)}
                                aria-label="Live camera preview"
                            />
                            {!cameraReady && !cameraError && (
                                <div className="camera-starting"><ScanLine /><span>Starting camera</span></div>
                            )}
                            {cameraError && (
                                <div className="camera-fallback" role="alert">
                                    <AlertTriangle />
                                    <p>{cameraError}</p>
                                    <label htmlFor="device-camera-capture">Open device camera</label>
                                </div>
                            )}
                            <div className="camera-frame" aria-hidden="true"><i /><i /><i /><i /></div>
                        </div>

                        <div className="camera-controls">
                            <p>Use natural light and keep every item visible.</p>
                            <button type="button" className="shutter-button" onClick={captureCameraPhoto} disabled={!cameraReady || Boolean(cameraError)}>
                                <span /><b>Capture meal</b>
                            </button>
                            <label className="camera-gallery-link" htmlFor="gallery-upload">Choose from gallery instead</label>
                        </div>
                    </section>
                </div>
            )}

            <section className="nutrition-marquee" aria-label="Nutrition categories included in an analysis" data-reveal="fade">
                <div className="marquee-track">
                    <div className="marquee-group">
                        <span>Calories</span><i />
                        <span>Protein</span><i />
                        <span>Carbohydrates</span><i />
                        <span>Fats</span><i />
                        <span>Micronutrients</span><i />
                        <span>Ingredients</span><i />
                    </div>
                    <div className="marquee-group" aria-hidden="true">
                        <span>Calories</span><i />
                        <span>Protein</span><i />
                        <span>Carbohydrates</span><i />
                        <span>Fats</span><i />
                        <span>Micronutrients</span><i />
                        <span>Ingredients</span><i />
                    </div>
                </div>
            </section>

            <section className="context-story content-section" data-reveal="rise">
                <header className="context-heading">
                    <div>
                        <p className="section-kicker">From photo to context</p>
                        <span className="context-index" aria-hidden="true">01 — 02</span>
                    </div>
                    <div>
                        <h2>A clearer look at<br />the food in front of you.</h2>
                        <p>Syenxa Calories turns visible meal details into an organized estimate you can understand at a glance.</p>
                    </div>
                </header>

                <div className="context-composition">
                    <figure className="meal-lens" data-reveal-child>
                        <img
                            src="https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=1600&q=90"
                            alt="A colorful bowl filled with vegetables"
                            loading="lazy"
                            decoding="async"
                        />
                        <div className="meal-lens-shade" aria-hidden="true" />
                        <div className="lens-status"><span /> Meal in frame</div>
                        <figcaption>
                            <div className="lens-evidence">
                                <span>Image evidence</span>
                                <strong>3 visible food groups</strong>
                            </div>
                            <div className="lens-foods" aria-label="Visible food groups">
                                <span>Leafy greens</span>
                                <span>Plant protein</span>
                                <span>Fresh vegetables</span>
                            </div>
                        </figcaption>
                    </figure>

                    <div className="context-readout">
                        <article className="readout-card readout-detect" data-reveal-child>
                            <div className="readout-topline"><span>01 / Detect</span><ScanLine aria-hidden="true" /></div>
                            <div>
                                <h3>Visible details become useful structure.</h3>
                                <p>The workflow identifies foods and estimates portions before calculating the nutrition breakdown.</p>
                            </div>
                            <div className="readout-tags" aria-label="Detected meal details">
                                <span>Foods</span><span>Portions</span><span>Preparation</span>
                            </div>
                        </article>

                        <article className="readout-card readout-explain" data-reveal-child>
                            <div className="readout-topline"><span>02 / Explain</span><Activity aria-hidden="true" /></div>
                            <div>
                                <h3>More than one calorie number.</h3>
                                <p>See individual foods, macros, micronutrients, assumptions, and confidence in the same result.</p>
                            </div>
                            <div className="macro-preview" aria-hidden="true">
                                <span>Protein</span>
                                <span>Carbs</span>
                                <span>Fats</span>
                            </div>
                        </article>
                    </div>
                </div>
            </section>

            <section className="truth-ledger content-section" data-reveal="rise">
                <div className="truth-heading">
                    <div className="truth-seal"><Check aria-hidden="true" /><span>Estimate<br />principles</span></div>
                    <div>
                        <p className="section-kicker">Designed for honest estimates</p>
                        <h2>Useful guidance.<br /><em>Clear limits.</em></h2>
                    </div>
                    <p className="truth-summary">The result separates what can be seen from what has to be assumed—so the estimate stays useful without pretending to be exact.</p>
                </div>

                <div className="truth-notes">
                    <article data-reveal-child>
                        <span className="truth-code">Shown</span>
                        <div><span>What the image shows</span><h3>Evidence first</h3></div>
                        <p>The analysis is grounded in visible ingredients and portions, not hidden recipe information.</p>
                    </article>
                    <article data-reveal-child>
                        <span className="truth-code">Variable</span>
                        <div><span>What may vary</span><h3>Assumptions included</h3></div>
                        <p>Preparation method, sauces, oils, and exact serving weights can change the final nutrition values.</p>
                    </article>
                    <article data-reveal-child>
                        <span className="truth-code">Purpose</span>
                        <div><span>How to use it</span><h3>Awareness, not advice</h3></div>
                        <p>Use the result as practical food awareness. It is not laboratory analysis or medical advice.</p>
                    </article>
                </div>
            </section>

            <footer className="footer footer-v2" data-reveal="fade">
                <div className="footer-brand"><span><Leaf size={18} /></span> Syenxa Calories</div>
                <p>Nutrition estimates are for general guidance and may vary by portion and preparation.</p>
                <strong>Built for better<br />food awareness.</strong>
            </footer>
        </main>
    );
};

export default UploadFiles;
