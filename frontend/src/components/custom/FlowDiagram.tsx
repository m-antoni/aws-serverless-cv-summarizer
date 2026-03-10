import Zoom from "react-medium-image-zoom";
import "react-medium-image-zoom/dist/styles.css";

interface ImageProps {
  src: string;
  alt: string;
}

export const FlowDiagram = ({ src, alt }: ImageProps) => {
  return (
    <div className="p-1 rounded-xl max-w-[500px]">
      <h2>Flow Diagram:</h2>
      <p className="text-sm text-gray-500 mb-2 text-center">Click To Expand</p>

      {/* Changed 'margin' to 'zoomMargin' */}
      <Zoom zoomMargin={10}>
        <img
          src={src}
          alt={alt}
          className="w-full h-auto rounded-md cursor-zoom-in shadow-sm"
        />
      </Zoom>
    </div>
  );
};
