const { React } = globalThis;

interface ModalProps {
    openModal: boolean;
    closeModal: () => void;
    children: React.ReactElement;
}

export function Modal({ openModal, closeModal, children }: ModalProps) {
    const ref = React.useRef<any>();

    React.useEffect(() => {
        if (openModal) {
            ref.current?.showModal();
        } else {
            ref.current?.close();
        }
    }, [openModal]);

    return (
        <dialog ref={ref} onCancel={closeModal}>
            {children}
            <button onClick={closeModal}>Close</button>
        </dialog>
    );
}
