'use client';

import styles from "./styles.module.css";
import FileUploader from "@/app/components/file-uploader";

const FileSearchPage = () => {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1>PDF Simplifier</h1>
        <p>Upload a PDF file to simplify its content.</p>
        <FileUploader />
      </div>
    </div>
  );
};

export default FileSearchPage; 