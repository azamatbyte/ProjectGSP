import React from "react";
import PropTypes from "prop-types";
import { Progress } from "antd";
import Card from "components/shared-components/Card";

export const GoalWidget = ({ title, value, size, subtitle, strokeWidth, extra, cardStyle, cardBodyStyle }) => {
	const mergedCardStyle = {
		display: "flex",
		flexDirection: "column",
		...cardStyle
	};
	const mergedBodyStyle = {
		flex: 1,
		width: "100%",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		...cardBodyStyle
	};
	const detailsMaxWidth = `${size + 60}px`;

	return (
		<Card style={mergedCardStyle} bodyStyle={mergedBodyStyle}>
			<div className="text-center" style={{ width: "100%" }}>
				{title && <h4 className="mb-3 font-weight-bold">{title}</h4>}
				<Progress type="dashboard" percent={value} size={size} strokeWidth={strokeWidth}/>
				<div className={`mt-2 mx-auto text-muted ${extra ? "mb-3" : ""}`} style={{ maxWidth: detailsMaxWidth }}>
					{subtitle}
				</div>
				{extra && (
					<div className="mx-auto" style={{ maxWidth: detailsMaxWidth }}>
						{extra}
					</div>
				)}
			</div>
		</Card>
	);
};

GoalWidget.propTypes = {
	title: PropTypes.oneOfType([
		PropTypes.string,
		PropTypes.element
	]),
	value: PropTypes.number,
	size: PropTypes.number,
	subtitle: PropTypes.string,
	cardStyle: PropTypes.object,
	cardBodyStyle: PropTypes.object,
	extra:PropTypes.oneOfType([
		PropTypes.string,
		PropTypes.element
	])
};

GoalWidget.defaultProps = {
	strokeWidth: 4,
	size: 150
};

export default GoalWidget;
