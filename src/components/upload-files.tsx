import { useEffect, useState } from "react";
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
    Zap,
} from "lucide-react";
import { useAuth } from "../auth/use-auth";
import { AnalysisApiError, analyzeMeal } from "../lib/analyze-meal";
import { getScanQuota } from "../lib/quota";
import type { MealAnalysis, ScanQuota } from "../types";
import AuthPanel from "./auth-panel";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const directN8nWebhookUrl = import.meta.env.VITE_N8N_MEAL_WEBHOOK_URL?.trim()
    || "https://n8n.srv929626.hstgr.cloud/webhook/meal-ai";
const directN8nMode = Boolean(directN8nWebhookUrl);

type DirectWebhookPayload = {
    output?: unknown;
    food?: unknown;
    total?: unknown;
};

const isMealAnalysis = (value: unknown): value is MealAnalysis => {
    if (!value || typeof value !== "object") return false;

    const candidate = value as { food?: unknown; total?: unknown };
    if (!Array.isArray(candidate.food) || !candidate.total || typeof candidate.total !== "object") return false;

    const total = candidate.total as Record<string, unknown>;
    return ["calories", "protein", "carbs", "fat"].every((key) => typeof total[key] === "number");
};

const getMealAnalysisFromWebhook = (payload: unknown): MealAnalysis | null => {
    const responseItem = Array.isArray(payload) ? payload[0] : payload;
    if (!responseItem || typeof responseItem !== "object") return null;

    const response = responseItem as DirectWebhookPayload;
    const candidate = response.output ?? response;
    return isMealAnalysis(candidate) ? candidate : null;
};

const getResetCopy = (resetAt: string | null) => {
    if (!resetAt) return "within 24 hours";
    const milliseconds = new Date(resetAt).getTime() - Date.now();
    if (milliseconds <= 0) return "now";
    const totalMinutes = Math.ceil(milliseconds / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const UploadFiles = () => {
    const { user, loading: authLoading, signOut } = useAuth();
    const [result, setResult] = useState<MealAnalysis | null>(null);
    const [quota, setQuota] = useState<ScanQuota | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [, refreshClock] = useState(0);

    useEffect(() => {
        if (directN8nMode) {
            setQuota(null);
            return;
        }

        if (!user) {
            setQuota(null);
            setResult(null);
            setImagePreview(null);
            setError(null);
            return;
        }

        let active = true;
        getScanQuota()
            .then((nextQuota) => {
                if (active) setQuota(nextQuota);
            })
            .catch(() => {
                if (active) setError("We couldn't load your scan allowance. Refresh and try again.");
            });

        return () => { active = false; };
    }, [user]);

    useEffect(() => {
        if (!quota?.resetAt || quota.remaining > 0) return;
        const timer = window.setInterval(() => refreshClock((value) => value + 1), 30_000);
        return () => window.clearInterval(timer);
    }, [quota]);

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
        }, { threshold: 0.14, rootMargin: "0px 0px -8%" });

        revealItems.forEach((item) => observer.observe(item));

        return () => {
            observer.disconnect();
            motionRoot.classList.remove("motion-ready");
        };
    }, []);

    const handleUpload = async (file: File) => {
        if (!directN8nMode && !user) {
            setError("Sign in before scanning a meal.");
            return;
        }
        if (!directN8nMode && quota?.remaining === 0) {
            setError(`Your free scans reset in ${getResetCopy(quota.resetAt)}.`);
            return;
        }
        if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
            setError("Choose a JPG, PNG, or WEBP image.");
            return;
        }
        if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
            setError("Choose an image smaller than 10 MB.");
            return;
        }

        // Create image preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);

        setError(null);
        setLoading(true);
        try {
            if (directN8nMode) {
                const formData = new FormData();
                formData.append("file", file);
                const response = await fetch(directN8nWebhookUrl, { method: "POST", body: formData });
                const payload: unknown = await response.json().catch(() => null);

                if (!response.ok) {
                    throw new Error(`n8n test webhook returned HTTP ${response.status}.`);
                }

                const output = getMealAnalysisFromWebhook(payload);
                if (!output) {
                    throw new Error("n8n responded, but the nutrition data format was not recognized.");
                }

                setResult(output);
            } else {
                const data = await analyzeMeal(file);
                setResult(data.output);
                setQuota(data.quota);
            }
        } catch (caught) {
            if (caught instanceof AnalysisApiError) {
                if (caught.quota) setQuota(caught.quota);
                if (caught.status === 401) await signOut().catch(() => undefined);
                setError(caught.message);
            } else {
                setError(caught instanceof Error ? caught.message : "Meal analysis failed. Check your connection and try again.");
            }
        } finally {
            setLoading(false);
        }
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
        if ((directN8nMode || quota?.remaining !== 0) && e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleUpload(e.dataTransfer.files[0]);
        }
    };

    const quotaExhausted = !directN8nMode && quota?.remaining === 0;
    const canScan = directN8nMode || Boolean(user);
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
                <a className="brand" href="#top" aria-label="Huzzi AI home">
                    <span className="brand-mark"><Leaf aria-hidden="true" /></span>
                    <span className="brand-name">huzzi</span>
                    <span className="brand-tag">nutrition intelligence</span>
                </a>
                {directN8nMode ? (
                    <div className="system-status test-status" aria-label="n8n direct workflow mode enabled">
                        <span className="status-dot" />
                        n8n workflow connected
                    </div>
                ) : user ? (
                    <div className="user-tools">
                        <span className="quota-chip"><b>{quota?.remaining ?? "..."}</b> / 3 scans left</span>
                        <span className="user-name" title={user.email}>{displayName}</span>
                        <button className="sign-out-button" type="button" onClick={() => signOut()} aria-label="Sign out">
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

            <section className={`scanner-workspace ${result ? "has-result" : ""}`} id="meal-scanner" data-reveal="rise">
                <div className="workspace-heading">
                    <div>
                        <p className="section-kicker">Meal scanner</p>
                        <h2>{!canScan ? "Your free scans start here" : result ? "Your nutrition snapshot" : "Start with a clear photo"}</h2>
                    </div>
                    <span className="workspace-step">
                        {directN8nMode
                            ? "Authentication temporarily disabled"
                            : user
                            ? quotaExhausted
                                ? `Resets in ${getResetCopy(quota?.resetAt ?? null)}`
                                : `${quota?.remaining ?? "..."} of 3 scans available`
                            : "Account required"}
                    </span>
                </div>

                {!directN8nMode && authLoading ? (
                    <div className="auth-loading" aria-live="polite">
                        <span className="loading-mark"><ScanLine /></span>
                        <p>Checking your session…</p>
                    </div>
                ) : !canScan ? (
                    <div className="auth-layout">
                        <aside className="auth-benefits">
                            <p className="section-kicker">A useful free tier</p>
                            <h3>Three complete scans.<br />Every 24 hours.</h3>
                            <p>Sign in once, then use Huzzi AI for breakfast, lunch, and dinner without surprise charges.</p>
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
                                accept="image/*"
                                onChange={(e) => e.target.files && handleUpload(e.target.files[0])}
                                className="file-input"
                                id="file-upload"
                                aria-label="Upload a meal photo"
                                disabled={quotaExhausted || loading}
                            />

                            {imagePreview ? (
                                <>
                                    <img src={imagePreview} alt="Meal selected for nutrition analysis" className="meal-preview" />
                                    <div className="scan-corners" aria-hidden="true"><i /><i /><i /><i /></div>
                                    {loading && <div className="scan-line" aria-hidden="true" />}
                                    {!quotaExhausted && (
                                        <label className="change-photo" htmlFor="file-upload">
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
                                <label className="drop-content" htmlFor="file-upload">
                                    <span className="upload-icon"><Camera aria-hidden="true" /></span>
                                    <span className="drop-title">Drop your meal here</span>
                                    <span className="drop-help">or choose a photo from your device</span>
                                    <span className="browse-button">Choose photo <ChevronRight size={17} /></span>
                                </label>
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

            <section className="process-story content-section" data-reveal="rise">
                <div className="section-intro">
                    <p className="section-kicker">From photo to context</p>
                    <h2>A clearer look at<br />the food in front of you.</h2>
                    <p>Huzzi turns visible meal details into an organized estimate you can understand at a glance.</p>
                </div>

                <div className="process-grid">
                    <figure className="process-image" data-reveal-child>
                        <img
                            src="https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=1400&q=88"
                            alt="A colorful bowl filled with vegetables"
                            loading="lazy"
                            decoding="async"
                        />
                    </figure>

                    <article className="process-card process-card-scan" data-reveal-child>
                        <span className="process-icon"><ScanLine aria-hidden="true" /></span>
                        <div>
                            <h3>Visible details become useful structure.</h3>
                            <p>The workflow identifies foods and estimates portions before calculating the nutrition breakdown.</p>
                        </div>
                    </article>

                    <article className="process-card process-card-context" data-reveal-child>
                        <span className="process-icon"><Activity aria-hidden="true" /></span>
                        <div>
                            <h3>More than one calorie number.</h3>
                            <p>See individual foods, macros, micronutrients, assumptions, and confidence in the same result.</p>
                        </div>
                    </article>
                </div>
            </section>

            <section className="honesty-section content-section" data-reveal="rise">
                <div className="honesty-heading">
                    <span className="honesty-icon"><Check aria-hidden="true" /></span>
                    <p className="section-kicker">Designed for honest estimates</p>
                    <h2>Useful guidance.<br /><em>Clear limits.</em></h2>
                </div>

                <div className="honesty-notes">
                    <article data-reveal-child>
                        <span>What the image shows</span>
                        <h3>Evidence first</h3>
                        <p>The analysis is grounded in visible ingredients and portions, not hidden recipe information.</p>
                    </article>
                    <article data-reveal-child>
                        <span>What may vary</span>
                        <h3>Assumptions included</h3>
                        <p>Preparation method, sauces, oils, and exact serving weights can change the final nutrition values.</p>
                    </article>
                    <article data-reveal-child>
                        <span>How to use it</span>
                        <h3>Awareness, not advice</h3>
                        <p>Use the result as practical food awareness. It is not laboratory analysis or medical advice.</p>
                    </article>
                </div>
            </section>

            <footer className="footer" data-reveal="fade">
                <div className="footer-brand"><Leaf size={18} /> huzzi ai</div>
                <p>Nutrition estimates are for general guidance and may vary by portion and preparation.</p>
                <span>Built for better food awareness.</span>
            </footer>
        </main>
    );
};

export default UploadFiles;
