import { useState } from "react";
import { Camera, TrendingUp, Flame, Zap, Upload, Activity } from "lucide-react";

const UploadFiles = () => {
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);

    const handleUpload = async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);

        // Create image preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);

        setLoading(true);
        try {
            const response = await fetch(
                "https://n8n.srv929626.hstgr.cloud/webhook/meal-ai",
                {
                    method: "POST",
                    body: formData,
                }
            );
            const data = await response.json();
            setResult(data?.output || null);
        } catch (error) {
            console.error("Error uploading file:", error);
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
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleUpload(e.dataTransfer.files[0]);
        }
    };

    const MacroCard = ({ icon: Icon, label, value, color }: any) => (
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700 hover:border-orange-500 transition-all duration-300 transform hover:scale-105">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${color}`}>
                    <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                    <p className="text-gray-400 text-xs uppercase tracking-wider">{label}</p>
                    <p className="text-white text-xl font-bold">{value}</p>
                </div>
            </div>
        </div>
    );

    return (
        <>

            <div className="min-h-screen bg-gradient-to-br  pt-10 flex flex-col  items-center justify-evenly from-gray-900 via-black to-gray-900 relative overflow-hidden">
                {/* Animated background elements */}
                <div className="absolute inset-0  overflow-hidden pointer-events-none">
                    <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse"></div>
                    <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-red-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse" style={{ animationDelay: "1s" }}></div>
                </div>
                <div className="text-center mb-12 animate-fade-in">
                    <div className="flex items-center justify-center gap-3 mb-4 ">
                        <div className="p-3 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl">
                            <Flame className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-5xl  font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-600">
                            Syenxa AI
                        </h1>
                    </div>
                    <p className="text-gray-400 text-lg">Instant Meal Analysis • Macro Tracking • Performance Nutrition</p>
                </div>
                <div className="relative z-10 container mx-auto px-4 py-8 max-w-6xl">
                    {/* Header */}


                    <div className="grid lg:grid-cols-1 ">
                        {/* Upload Section */}
                        <div className="space-y-6 ">
                            <div className="bg-gradient-to-br  from-gray-800 to-gray-900 rounded-2xl p-15! border border-gray-700 shadow-2xl">
                                <h2 className="text-2xl font-bold text-white mb-6 flex items-center my-5! gap-2 text-center">
                                    <Camera className="w-6 h-6 text-orange-500" />
                                    Scan Your Meal
                                </h2>

                                {/* Drag & Drop Zone */}
                                <div
                                    onDragEnter={handleDrag}
                                    onDragLeave={handleDrag}
                                    onDragOver={handleDrag}
                                    onDrop={handleDrop}
                                    className={`relative border-2 border-dashed rounded-xl text-center transition-all duration-300 p-10! ${dragActive
                                        ? "border-orange-500 bg-orange-500/10"
                                        : "border-gray-600 hover:border-orange-500/50"
                                        }`}
                                >
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => e.target.files && handleUpload(e.target.files[0])}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        id="file-upload"
                                    />

                                    {imagePreview ? (
                                        <div className="relative">
                                            <img src={imagePreview} alt="Preview" className="w-full h-64 object-cover rounded-lg" />
                                            <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                                <p className="text-white font-semibold">Click to change image</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="flex justify-center">
                                                <div className="p-6! bg-gradient-to-br from-orange-500 to-red-600 rounded-full">
                                                    <Upload className="w-12 h-12 text-white" />
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-white font-semibold text-lg mb-2">Drop your meal photo here</p>
                                                <p className="text-gray-400 text-sm">or click to browse</p>
                                            </div>
                                            <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                                                <Zap className="w-4 h-4" />
                                                <span>Instant AI-powered analysis</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {loading && (
                                    <div className="mt-6 space-y-3">
                                        <div className="flex items-center justify-center gap-3">
                                            <div className="w-3 h-3 bg-orange-500 rounded-full animate-bounce"></div>
                                            <div className="w-3 h-3 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                                            <div className="w-3 h-3 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                                        </div>
                                        <p className="text-orange-400 font-semibold text-center">Analyzing your meal...</p>
                                    </div>
                                )}
                            </div>

                            {/* Features */}
                            <div className="flex flex-wrap justify-center gap-4 my-10! ">
                                <div className="bg-gray-800/50 py-5! gap-5 backdrop-blur rounded-xl flex flex-col items-center justify-center p-4! border border-gray-700 text-center min-w-[200px] w-full max-w-[300px]">
                                    <Activity className="w-6 h-6 text-orange-500  mx-auto mb-2" />
                                    <p className="text-white text-lg font-semibold ">Instant Scan</p>
                                </div>
                                <div className="bg-gray-800/50 py-5! gap-5 min-w-[200px] w-full max-w-[300px]  flex flex-col items-center justify-center backdrop-blur rounded-xl p-4! border border-gray-700 text-center">
                                    <TrendingUp className="w-6 h-6 text-green-500 mx-auto mb-2" />
                                    <p className="text-white text-lg font-semibold">Track Progress</p>
                                </div>
                                <div className="bg-gray-800/50 backdrop-blur  min-w-[200px] w-full max-w-[300px] py-5! gap-5    flex flex-col items-center justify-center rounded-xl p-4! border border-gray-700 text-center">
                                    <Flame className="w-6 h-6 text-red-500 mx-auto mb-2" />
                                    <p className="text-white text-lg font-semibold">Burn Smart</p>
                                </div>
                            </div>
                        </div>

                        {/* Results Section */}
                        <div className="">
                            {result ? (
                                <>
                                    {/* Total Macros */}
                                    <div className="bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl p-8! shadow-2xl transform hover:scale-105 transition-all duration-300">
                                        <div className="flex items-center gap-3 mb-6">
                                            <Flame className="w-8 h-8 text-white" />
                                            <h3 className="text-white text-2xl font-black">Total Nutrition</h3>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-white/10 backdrop-blur rounded-xl p-4! border border-white/20">
                                                <p className="text-white/80 text-sm uppercase tracking-wider">Calories</p>
                                                <p className="text-white text-3xl font-black">{result.total.calories}</p>
                                            </div>
                                            <div className="bg-white/10 backdrop-blur rounded-xl p-4!    border border-white/20">
                                                <p className="text-white/80 text-sm uppercase tracking-wider">Protein</p>
                                                <p className="text-white text-3xl font-black">{result.total.protein}g</p>
                                            </div>
                                            <div className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/20">
                                                <p className="text-white/80 text-sm uppercase tracking-wider">Carbs</p>
                                                <p className="text-white text-3xl font-black">{result.total.carbs}g</p>
                                            </div>
                                            <div className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/20">
                                                <p className="text-white/80 text-sm uppercase tracking-wider">Fat</p>
                                                <p className="text-white text-3xl font-black">{result.total.fat}g</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Food Items */}
                                    <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8! border border-gray-700 shadow-2xl">
                                        <h3 className="text-white text-xl font-bold mb-6 flex items-center gap-2">
                                            <TrendingUp className="w-5 h-5 text-green-500" />
                                            Detected Foods
                                        </h3>
                                        <div className="space-y-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                                            {result.food.map((item: any, index: number) => (
                                                <div
                                                    key={index}
                                                    className="bg-gray-700/50 rounded-xl p-5 border border-gray-600 hover:border-orange-500 transition-all duration-300 transform hover:translate-x-2"
                                                    style={{ animationDelay: `${index * 0.1}s` }}
                                                >
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h4 className="text-white font-bold text-lg">{item.name}</h4>
                                                        <span className="text-orange-400 text-sm font-semibold bg-orange-500/20 px-3 py-1 rounded-full">
                                                            {item.quantity}
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-4 gap-2">
                                                        <div className="text-center">
                                                            <p className="text-gray-400 text-xs">Cal</p>
                                                            <p className="text-white font-bold">{item.calories}</p>
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-gray-400 text-xs">Pro</p>
                                                            <p className="text-white font-bold">{item.protein}g</p>
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-gray-400 text-xs">Carbs</p>
                                                            <p className="text-white font-bold">{item.carbs}g</p>
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-gray-400 text-xs">Fat</p>
                                                            <p className="text-white font-bold">{item.fat}g</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="bg-gradient-to-br p-10! from-gray-800 to-gray-900 rounded-2xl p-12 border border-gray-700 text-center h-full flex flex-col items-center justify-center">
                                    <div className="w-24 h-24 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center mb-6 opacity-20">
                                        <Camera className="w-12 h-12 text-white" />
                                    </div>
                                    <h3 className="text-gray-500 text-xl font-semibold mb-2">No Results Yet</h3>
                                    <p className="text-gray-600">Upload a meal photo to see detailed nutrition breakdown</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <style>{`
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(-20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in {
                    animation: fade-in 0.6s ease-out;
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: linear-gradient(180deg, #f97316, #dc2626);
                    border-radius: 10px;
                }
            `}</style>
            </div>
        </>
    );
};

export default UploadFiles;