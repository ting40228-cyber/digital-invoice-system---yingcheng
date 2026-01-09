import React, { useRef, useEffect, useState } from 'react';
import { Eraser, PenLine, Smartphone, RotateCw } from 'lucide-react';

interface SignatureCanvasProps {
  onChange: (base64: string | null) => void;
  initialData?: string | null;
  readOnly?: boolean;
}

const SignatureCanvas: React.FC<SignatureCanvasProps> = ({ onChange, initialData, readOnly = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Resize observer to handle responsive width
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current && !readOnly) {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        
        // Save current content
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        tempCtx?.drawImage(canvas, 0, 0);

        // Resize
        canvas.width = container.offsetWidth;
        canvas.height = 200; // Fixed height for better mobile area

        // Restore context settings
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#000000';
            // Restore content (scaled) - optional, currently clears on resize to avoid distortion
            // ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height); 
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Init

    return () => window.removeEventListener('resize', handleResize);
  }, [readOnly]);

  // Load initial data
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && initialData) {
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        // Clear before drawing
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        // Draw image scaled to fit height, centered
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const x = (canvas.width / 2) - (img.width / 2) * scale;
        const y = (canvas.height / 2) - (img.height / 2) * scale;
        ctx?.drawImage(img, x, y, img.width * scale, img.height * scale);
        setHasSignature(true);
      };
      img.src = initialData;
    }
  }, [initialData]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSignature(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (readOnly) return;
    if (isDrawing) {
      const canvas = canvasRef.current;
      if (canvas) {
        onChange(canvas.toDataURL('image/png'));
      }
    }
    setIsDrawing(false);
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handleClear = () => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      setHasSignature(false);
      onChange(null);
    }
  };

  if (readOnly) {
    return (
      <div className="border border-brand-200 bg-white w-full h-32 flex items-center justify-center relative rounded-lg">
         {initialData ? (
           <img src={initialData} alt="Signature" className="max-h-full max-w-full p-2" />
         ) : (
           <span className="text-slate-300 italic text-sm">尚未簽署</span>
         )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 w-full" ref={containerRef}>
      {/* Mobile Hint */}
      <div className="md:hidden flex items-center justify-center text-[10px] text-brand-600 bg-brand-50 p-1 rounded mb-1 animate-pulse">
        <Smartphone className="w-3 h-3 mr-1" />
        <RotateCw className="w-3 h-3 mr-1" />
        <span>建議將手機橫向以獲得更大簽名空間</span>
      </div>

      <div className="relative border-2 border-dashed border-brand-300 bg-white rounded-xl overflow-hidden touch-none shadow-inner">
        <canvas
          ref={canvasRef}
          className="w-full h-[200px] cursor-crosshair block"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {!hasSignature && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-brand-300/50">
            <PenLine className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-sm font-medium">請在此區域簽名</span>
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleClear}
          className="flex items-center text-xs text-red-500 hover:text-red-700 px-3 py-1 hover:bg-red-50 rounded transition-colors"
        >
          <Eraser className="w-3 h-3 mr-1" /> 清除重寫
        </button>
      </div>
    </div>
  );
};

export default SignatureCanvas;
