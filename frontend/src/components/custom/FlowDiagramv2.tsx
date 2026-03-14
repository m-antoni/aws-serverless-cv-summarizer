import { useRef } from "react";
import ImageGallery from "react-image-gallery";
import "react-image-gallery/styles/image-gallery.css";
import type { GalleryItem, ImageGalleryRef } from "react-image-gallery";

const images: GalleryItem[] = [
  {
    original: "/assets/img/image01.png",
    thumbnail: "/assets/img/image01.png",
  },
];

export default function FlowDiagramv2() {
  const galleryRef = useRef<ImageGalleryRef>(null);

  return (
    <>
      <h2 className="my-2">Flow Diagram:</h2>
      <ImageGallery
        ref={galleryRef}
        items={images}
        showPlayButton={false}
        showThumbnails={false}
        useBrowserFullscreen={true}
        onSlide={(index) => console.log("Slid to", index)}
      />
    </>
  );
}
