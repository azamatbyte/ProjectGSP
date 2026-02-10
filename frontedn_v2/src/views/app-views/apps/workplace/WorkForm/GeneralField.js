import React from "react";
import { Input, Row, Col, Card, Form } from "antd";
import { useTranslation } from "react-i18next";


const GeneralField = () => {
	const { t } = useTranslation();

	// const handleChange = (value, key) => {
	// 	if (key === "role") {
	// 		form.setFieldsValue({ role: value === "admin" ? "admin" : "superAdmin" });
	// 	} else if (key === "gender") {
	// 		form.setFieldsValue({ gender: value === "male" ? "male" : "female" });
	// 	}
	// };


	return (
		<Row gutter={16}>
			<Col xs={24} sm={24} md={17}>
					<Card title={t("basic_info")}>
					<Row gutter={16}>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="name" label={t("name")}>
								<Input
									className="w-100"
									maxLength={255}
									autoFocus
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
