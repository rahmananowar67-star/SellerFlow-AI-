import React, { useState } from 'react';
import { Package } from 'lucide-react';

interface ProductVisualProps {
  variant?: string;
  imageDataUrl?: string;
  title: string;
  accentColor?: string;
  className?: string;
  imgClassName?: string;
}

export const ProductVisual: React.FC<ProductVisualProps> = ({
  imageDataUrl,
  title,
  className = 'w-full aspect-[4/3]',
  imgClassName = 'w-full h-full object-cover',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  if (imageDataUrl && !imgFailed) {
    return (
      <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
        <img
          src={imageDataUrl}
          alt={title}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setImgFailed(true)}
          className={imgClassName}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-slate-100 border border-slate-200 flex flex-col items-center justify-center p-4 text-center ${className}`}
      role="img"
      aria-label={title}
    >
      <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 shadow-xs mb-2">
        <Package className="w-5 h-5" />
      </div>
      <p className="text-xs font-medium text-slate-600 line-clamp-2 max-w-[180px]">{title}</p>
    </div>
  );
};

export const HeroStudioArtwork: React.FC = () => {
  const showcaseItems = [
    {
      src: '/src/assets/images/prod_steel_bottle.jpg',
      alt: 'Insulated Stainless Steel Bottle',
      label: 'Bottles & Hydration',
    },
    {
      src: '/src/assets/images/prod_white_sneakers.jpg',
      alt: 'Full-Grain Leather Sneakers',
      label: 'Footwear & Shoes',
    },
    {
      src: '/src/assets/images/prod_handloom_kurta.jpg',
      alt: 'Assam Handloom Cotton Kurta',
      label: 'Fashion & Apparel',
    },
    {
      src: '/src/assets/images/prod_studio_headphones.jpg',
      alt: 'Reference Studio Headphones',
      label: 'Electronics & Audio',
    },
    {
      src: '/src/assets/images/prod_amber_serum.jpg',
      alt: 'Peptide Recovery Serum',
      label: 'Beauty & Cosmetics',
    },
    {
      src: '/src/assets/images/prod_field_watch.jpg',
      alt: 'Caliber 38 Automatic Watch',
      label: 'Watches & Accessories',
    },
  ];

  return (
    <div className="w-full h-full bg-slate-900 p-3 sm:p-4 grid grid-cols-3 grid-rows-2 gap-2.5 sm:gap-3">
      {showcaseItems.map((item) => (
        <div
          key={item.src}
          className="relative rounded-xl overflow-hidden bg-slate-800 border border-slate-700/80 group"
        >
          <img
            src={item.src}
            alt={item.alt}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent px-2.5 py-2">
            <p className="text-[11px] font-semibold text-white truncate">{item.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
};
