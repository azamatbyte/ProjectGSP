import { Card as AntdCard } from "antd";


const Card = ({style, ...rest}) => {
    return (
        <AntdCard style={{ marginBottom: 20, ...style }} {...rest} />
    );
};

export default Card;
