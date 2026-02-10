import React from "react";
import { Input, Row, Col, Card, Form } from "antd";
import { useTranslation } from "react-i18next";

function onChange(value) {
	console.log(`selected ${value}`);
}

function onBlur() {
	console.log("blur");
}

function onFocus() {
	console.log("focus");
}

const GeneralField = props => {
	const { t } = useTranslation();
	return (
		<Row gutter={16}>
			<Col xs={24} sm={24} md={17}>
				<Card>
					<Row gutter={16}>
					<Col xs={24} sm={24} md={12}>
						<Form.Item name="name" label={t("name")}>
							<Input
								showSearch
								className="w-100"
								style={{ width: 200}}
								placeholder={t("name")}
								optionFilterProp="children"
								onChange={onChange}
								onFocus={onFocus}
								onBlur={onBlur}
								tabIndex={1}
								// filterOption={(input, option) =>
								// 	option.props.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
								// }
								autoFocus={true}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										const nextInput = document.querySelector("[tabindex=\"1\"]");
										if (nextInput) nextInput.focus();
									}
								}}
							/>
						</Form.Item>
					</Col>
				</Row>
			</Card>

			</Col>

		</Row>
	);
};

export default GeneralField;
